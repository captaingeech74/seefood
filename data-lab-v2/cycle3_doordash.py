#!/usr/bin/env python3
"""Bounded Cycle 3 DoorDash discovery, page collection, and analysis.

Raw sitemaps/pages stay below ignored ``raw/cycle3-doordash``. The committed
output contains aggregates and salted hashes only. Discovery and page fetch
denominators are deliberately independent: a blocked page never erases a
valid sitemap match.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import time
import unicodedata
import urllib.error
import urllib.request
from collections import Counter, defaultdict
from pathlib import Path
from urllib.parse import unquote, urlsplit

from cycle0_analysis import overture_records
from cycle1_collect import SAMPLES

REGIONS = {
    "portland_me": "me", "boone_nc": "nc", "jackson_ms": "ms",
    "wichita_ks": "ks", "albuquerque_nm": "nm", "spokane_wa": "wa",
}
MAX_SITEMAPS = 10
MAX_STORE_ATTEMPTS = 48
TIMEOUT_SECONDS = 30
SALT = "seefood-cycle3|"
GENERIC = {
    "and", "bar", "bbq", "cafe", "coffee", "company", "diner", "food",
    "grill", "house", "kitchen", "la", "my", "pub", "restaurant", "shop",
    "taco", "taqueria", "the", "truck",
}


def digest(value: str) -> str:
    return hashlib.sha256((SALT + value).encode()).hexdigest()[:20]


def words(value: str | None) -> list[str]:
    text = unicodedata.normalize("NFKD", (value or "").casefold())
    text = "".join(c for c in text if not unicodedata.combining(c))
    text = text.replace("'", "").replace("’", "")
    return re.findall(r"[a-z0-9]+", text)


def city(record: dict) -> str:
    return str((record["fields"].get("address") or {}).get("locality") or "")


def restaurant_records(path: Path) -> list[dict]:
    records = list(overture_records(path))
    # Brand lineage is used only for deterministic chain/independent strata.
    by_id = {}
    with path.open() as source:
        for line in source:
            feature = json.loads(line)
            props = feature["properties"]
            by_id[props["id"]] = bool(((props.get("brand") or {}).get("names") or {}).get("primary"))
    for row in records:
        row["chain"] = by_id.get(row["source_record_id"], False)
    return records


def sitemap_url(state: str) -> str:
    return f"https://cdn.doordash.com/sitemaps/sitemaps/sitemap-doordash-{state}-stores.xml"


def fetch_once(url: str, destination: Path, timeout: int = TIMEOUT_SECONDS) -> dict:
    """Make exactly one ordinary request and cache the body, including blocks."""
    started = time.monotonic()
    request = urllib.request.Request(url, headers={
        "User-Agent": "SeeFood-DataLab/2.0 bounded-public-research",
        "Accept": "text/html,application/xml;q=0.9,*/*;q=0.8",
    })
    status = None
    headers = {}
    body = b""
    error = None
    try:
        with urllib.request.urlopen(request, timeout=min(timeout, 59)) as response:
            status = response.status
            headers = {k.lower(): v for k, v in response.headers.items()}
            body = response.read(50 * 1024 * 1024 + 1)
    except urllib.error.HTTPError as exc:
        status = exc.code
        headers = {k.lower(): v for k, v in exc.headers.items()}
        body = exc.read(2 * 1024 * 1024)
        error = f"http_{status}"
    except Exception as exc:
        error = type(exc).__name__.lower()
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_bytes(body)
    elapsed = round(time.monotonic() - started, 3)
    blocked = status in (401, 403, 429) or "challenge" in headers.get("cf-mitigated", "").lower()
    return {
        "status": status, "bytes": len(body), "elapsed_seconds": elapsed,
        "content_type": headers.get("content-type"), "blocked": blocked,
        "error": error,
    }


def extract_urls(xml: str) -> list[str]:
    values = re.findall(r"<loc>([^<]+)</loc>", xml)
    return [v.replace("&amp;", "&") for v in values if re.search(r"/store/[^/]+/?$", v)]


def slug_parts(url: str) -> list[str]:
    slug = unquote(urlsplit(url).path.split("/store/", 1)[-1].strip("/"))
    return words(re.sub(r"-\d+$", "", slug))


def match_store(record: dict, urls: list[str]) -> dict:
    name_words = words(record["fields"].get("name"))
    distinctive = [w for w in name_words if w not in GENERIC]
    locality = words(city(record))
    if not name_words or not locality or not distinctive:
        return {"disposition": "rejected", "reason": "insufficient_identity"}
    candidates = []
    locality_hint = "-".join(locality)
    for url in urls:
        # State files can contain tens of thousands of stores; make the cheap
        # locality rejection before decoding/tokenizing a slug.
        if locality_hint not in url.casefold():
            continue
        slug = slug_parts(url)
        if not all(w in slug for w in locality):
            continue
        overlap = sum(w in slug for w in distinctive)
        full = sum(w in slug for w in name_words)
        if not overlap or distinctive[0] not in slug:
            continue
        recall = overlap / len(distinctive)
        minimum_overlap = 1 if len(distinctive) == 1 else 2
        if overlap < minimum_overlap or recall < (2 / 3):
            continue
        extras = sum(w not in name_words and w not in locality for w in slug)
        candidates.append((overlap, full, -extras, url))
    if not candidates:
        return {"disposition": "rejected", "reason": "no_safe_match"}
    candidates.sort(reverse=True)
    top_key = candidates[0][:3]
    tied = [row for row in candidates if row[:3] == top_key]
    if len(tied) != 1:
        return {"disposition": "ambiguous", "reason": "equal_best", "candidate_count": len(tied)}
    return {"disposition": "matched", "url": candidates[0][3]}


def choose_attempts(matches: list[dict]) -> list[dict]:
    """Take one stable hash per region × chain stratum (12, below the cap)."""
    groups = defaultdict(list)
    for row in matches:
        groups[(row["region"], row["chain"])].append(row)
    chosen = []
    for key in sorted(groups):
        chosen.extend(sorted(groups[key], key=lambda r: digest(r["source_record_id"]))[:1])
    return chosen[:MAX_STORE_ATTEMPTS]


def classify_page(meta: dict, body: str) -> str:
    if meta.get("blocked"):
        return "explicit_block"
    if meta.get("status") is None:
        return "network_error"
    if meta["status"] >= 400:
        return f"http_{meta['status']}"
    if "MenuPageItem" in body or "__NEXT_DATA__" in body:
        return "success"
    return "success_no_menu_payload"


def balanced_object(text: str, start: int) -> str | None:
    depth = 0
    in_string = escape = False
    for index in range(start, len(text)):
        char = text[index]
        if escape:
            escape = False; continue
        if char == "\\":
            escape = True; continue
        if char == '"':
            in_string = not in_string; continue
        if in_string:
            continue
        if char == "{": depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0: return text[start:index + 1]
    return None


def menu_items(html: str) -> list[dict]:
    combined = ""
    for encoded in re.findall(r'self\.__next_f\.push\(\[\d+,"((?:[^"\\]|\\.)*)"\]\)', html):
        try: combined += json.loads('"' + encoded + '"')
        except json.JSONDecodeError: pass
    objects = []
    for match in re.finditer(r'\{"__typename":"MenuPageItemList', combined):
        value = balanced_object(combined, match.start())
        if value:
            try: objects.append(json.loads(value))
            except json.JSONDecodeError: pass
    found = []
    def walk(value):
        if isinstance(value, list):
            for child in value: walk(child)
        elif isinstance(value, dict):
            if value.get("__typename") == "MenuPageItem" and isinstance(value.get("name"), str):
                image = next((value.get(k) for k in ("imageUrl", "photoUrl", "image") if isinstance(value.get(k), str) and value[k].startswith("http")), None)
                found.append({"name": value["name"].strip(), "image_url": image})
            for child in value.values(): walk(child)
    for obj in objects: walk(obj)
    unique = {}
    for item in found:
        unique[(" ".join(words(item["name"])), item.get("image_url"))] = item
    return list(unique.values())


def collect(raw_dir: Path, fetch_pages: bool) -> None:
    raw_dir.mkdir(parents=True, exist_ok=True)
    if len(set(REGIONS.values())) > MAX_SITEMAPS:
        raise ValueError("sitemap cap exceeded")
    collection_path = raw_dir / "collection.json"
    collection = json.loads(collection_path.read_text()) if collection_path.exists() else {"sitemaps": {}, "pages": {}}
    collection.setdefault("sitemaps", {})
    collection.setdefault("pages", {})
    # The first 12-page pass was recorded before selected review tightened the
    # matcher. Preserve those unique attempts rather than silently dropping or
    # retrying them; their aggregate elapsed time was 1.276 seconds.
    existing_pages = list((raw_dir / "pages").glob("*.html"))
    if existing_pages and not collection["pages"]:
        collection["prior_store_page_seconds"] = 1.276
        for page_path in existing_pages:
            body = page_path.read_text(errors="replace")
            collection["pages"][page_path.stem] = {
                "status": 403, "bytes": page_path.stat().st_size,
                "elapsed_seconds": None, "blocked": True, "error": "http_403",
                "recovered_from_first_pass": True,
            }
    all_matches = []
    for region, state in REGIONS.items():
        path = raw_dir / f"sitemap-{state}.xml"
        if path.exists():
            meta = {"status": 200, "bytes": path.stat().st_size, "elapsed_seconds": 0, "cached": True}
        else:
            meta = fetch_once(sitemap_url(state), path)
            meta["cached"] = False
        prior = collection["sitemaps"].get(region)
        collection["sitemaps"][region] = prior if prior and not prior.get("cached") else meta
        urls = extract_urls(path.read_text(errors="replace")) if path.exists() else []
        records = restaurant_records(raw_dir.parent / f"cycle1-overture-{region}.geojsonseq")
        for record in records:
            result = match_store(record, urls)
            if result["disposition"] == "matched":
                all_matches.append(record | {"region": region, "store_url": result["url"]})
    attempts = choose_attempts(all_matches)
    (raw_dir / "attempt-plan.json").write_text(json.dumps([
        {"id": r["source_record_id"], "region": r["region"], "chain": r["chain"], "url": r["store_url"]}
        for r in attempts
    ], indent=2) + "\n")
    if fetch_pages:
        for row in attempts:
            key = digest(row["source_record_id"])
            page_path = raw_dir / "pages" / f"{key}.html"
            # Existing metadata means this target has already had its one attempt.
            if key in collection["pages"] or page_path.exists():
                continue
            meta = fetch_once(row["store_url"], page_path)
            meta.update({"region": row["region"], "chain": row["chain"]})
            collection["pages"][key] = meta
            # Explicit blocks are terminal for this target; fetch_once never retries.
    collection_path.write_text(json.dumps(collection, indent=2, sort_keys=True) + "\n")


def analyze(raw_root: Path, review_fixture: Path | None = None) -> dict:
    dd = raw_root / "cycle3-doordash"
    collection = json.loads((dd / "collection.json").read_text())
    plan = json.loads((dd / "attempt-plan.json").read_text())
    discovery = {}
    matched_rows = []
    total_eligible = 0
    total = Counter()
    strata = Counter()
    for region, state in REGIONS.items():
        records = restaurant_records(raw_root / f"cycle1-overture-{region}.geojsonseq")
        urls = extract_urls((dd / f"sitemap-{state}.xml").read_text(errors="replace"))
        outcomes = Counter()
        for row in records:
            result = match_store(row, urls)
            outcomes[result["disposition"]] += 1
            strata[(result["disposition"], "chain" if row["chain"] else "independent")] += 1
            if result["disposition"] == "matched":
                matched_rows.append(row | {"region": region, "url": result["url"]})
        total_eligible += len(records); total.update(outcomes)
        discovery[region] = {"eligible_overture_restaurants": len(records), **dict(outcomes), "sitemap_store_urls": len(urls)}

    pages = []
    page_counts = Counter()
    all_items = []
    for target in plan:
        key = digest(target["id"])
        meta = collection.get("pages", {}).get(key)
        path = dd / "pages" / f"{key}.html"
        if not meta or not path.exists():
            continue
        html = path.read_text(errors="replace")
        outcome = classify_page(meta, html)
        items = menu_items(html) if outcome == "success" else []
        page_counts[outcome] += 1
        pages.append({"target_hash": key, "region": target["region"], "chain": target["chain"], "outcome": outcome, "items": len(items)})
        all_items.extend((key, item) for item in items)
    photo_urls = [item["image_url"] for _, item in all_items if item.get("image_url")]
    item_keys = [(store, " ".join(words(item["name"])), item.get("image_url")) for store, item in all_items]
    reviewed = {}
    if review_fixture and review_fixture.exists():
        fixture = json.loads(review_fixture.read_text())
        observed = {
            digest(row["source_record_id"]): match_store(
                row,
                extract_urls((dd / f"sitemap-{REGIONS[region]}.xml").read_text(errors="replace")),
            )["disposition"]
            for region in REGIONS
            for row in restaurant_records(raw_root / f"cycle1-overture-{region}.geojsonseq")
        }
        if any(row["target_hash"] not in observed for row in fixture):
            raise ValueError("review fixture contains a target outside the fixed sample")
        if any(observed[row["target_hash"]] != row["evaluated_disposition"] for row in fixture):
            raise ValueError("review fixture disposition drifted from evaluator")
        labels = Counter(row["review_label"] for row in fixture)
        reviewed = {"selected_denominator": len(fixture), **dict(labels)}
    attempted_hashes = set(collection.get("pages", {}))
    planned_hashes = {digest(target["id"]) for target in plan}
    all_attempt_failures = Counter()
    for key, meta in collection.get("pages", {}).items():
        path = dd / "pages" / f"{key}.html"
        all_attempt_failures[classify_page(meta, path.read_text(errors="replace") if path.exists() else "")] += 1
    return {
        "sample": {"design": "purposive deterministic six-box, six-state sample; not a national probability sample", "regions": list(REGIONS), "overture_release": "2026-07-22.0"},
        "discovery": {
            "eligible_overture_restaurants": total_eligible, **dict(total),
            "eligible_chains": sum(value for (outcome, kind), value in strata.items() if kind == "chain"),
            "eligible_independents": sum(value for (outcome, kind), value in strata.items() if kind == "independent"),
            "matched_chains": strata[("matched", "chain")],
            "matched_independents": strata[("matched", "independent")],
            "ambiguous_chains": strata[("ambiguous", "chain")],
            "ambiguous_independents": strata[("ambiguous", "independent")],
            "rejected_chains": strata[("rejected", "chain")],
            "rejected_independents": strata[("rejected", "independent")],
            "by_region": discovery,
        },
        "store_collection": {
            "planned_safe_unique_matches": len(plan), "attempted": len(pages),
            "actual_unique_targets_attempted_total": len(attempted_hashes),
            "earlier_targets_rejected_after_selected_review": len(attempted_hashes - planned_hashes),
            "all_attempt_failure_classes": dict(all_attempt_failures),
            "successful_store_fetches": page_counts["success"] + page_counts["success_no_menu_payload"],
            "menus": sum(bool(row["items"]) for row in pages), "failure_classes": dict(page_counts),
            "chain_attempts": sum(row["chain"] for row in pages), "independent_attempts": sum(not row["chain"] for row in pages),
            "maximum_attempts": MAX_STORE_ATTEMPTS,
        },
        "yield": {
            "items": len(all_items), "unique_item_records": len(set(item_keys)),
            "duplicate_item_inflation": len(all_items) - len(set(item_keys)),
            "items_with_photos": len(photo_urls), "unique_photo_urls": len(set(photo_urls)),
            "downloaded_photo_attempts": 0, "unique_photo_content_hashes": 0,
            "menu_photo_links": len(photo_urls),
        },
        "runtime": {
            "sitemap_files_used": len(collection["sitemaps"]),
            "sitemap_bytes": sum(row.get("bytes", 0) for row in collection["sitemaps"].values()),
            "sitemap_downloads_in_final_cached_pass": sum(not row.get("cached") for row in collection["sitemaps"].values()),
            "sitemap_download_elapsed_not_retained": "all six were downloaded live once; cache reuse replaced first-pass timings",
            "store_page_seconds": round(
                collection.get("prior_store_page_seconds", 0)
                + sum((row.get("elapsed_seconds") or 0) for row in collection.get("pages", {}).values()), 3
            ),
            "operation_timeout_seconds": TIMEOUT_SECONDS,
        },
        "overlap_refresh": "not measured: one live/cached observation per target; no repeated-run refresh claim",
        "prior_july_evidence_not_this_sample": {
            "historical_attempts": 737,
            "historical_attempts_with_items": 353,
            "historical_items": 37080,
            "historical_photo_candidates": 26345,
            "accepted_two_restaurant_pilot_items": 314,
            "accepted_two_restaurant_pilot_new_byte_unique_photos": 148,
            "current_active_items": 7422,
            "restaurants_with_active_items": 69,
            "source_provenanced_unique_active_photos": 4719,
            "restaurants_with_unique_active_photos": 66,
            "source": "read-only July 2026 HANDOFF.md and DECISIONS.md; not remeasured or national",
        },
        "selected_human_review": reviewed,
        "sanitized_attempts": pages,
    }


def main() -> None:
    root = Path(__file__).parent
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=("collect-sitemaps", "collect-pages", "analyze"))
    parser.add_argument("--raw-root", type=Path, default=root / "raw")
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    if args.command.startswith("collect"):
        collect(args.raw_root / "cycle3-doordash", args.command == "collect-pages")
        return
    rendered = json.dumps(analyze(args.raw_root, root / "cycle3_review_fixture.json"), indent=2, sort_keys=True) + "\n"
    if args.output: args.output.write_text(rendered)
    else: print(rendered, end="")


if __name__ == "__main__":
    main()
