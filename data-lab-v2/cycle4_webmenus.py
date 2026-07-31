#!/usr/bin/env python3
"""Bounded Cycle 4 restaurant-website and ordering-platform measurement.

Raw HTML, URLs, and image bytes stay in ignored ``raw/cycle4-webmenus``.
Committed outputs contain aggregates and salted hashes only. Collection makes
one attempt per URL, follows at most one menu/order link per restaurant, and
never exceeds 60 total requests.
"""

from __future__ import annotations

import argparse
import hashlib
import html as html_module
import json
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter, defaultdict
from html.parser import HTMLParser
from pathlib import Path

from cycle1_analysis import load_web_cache
from cycle1_webcheck import choose_overture_targets, digest as cycle1_digest
from cycle2_enrichment import website_disposition
from cycle3_doordash import REGIONS, extract_urls, match_store, restaurant_records

MAX_REQUESTS = 60
TIMEOUT_SECONDS = 30
MAX_BODY_BYTES = 12 * 1024 * 1024
SALT = "seefood-cycle4|"
PLATFORM_HOSTS = {
    "menufy": ("menufy.com", "hungerrush.com"),
    "toast": ("toasttab.com",), "chownow": ("chownow.com",),
    "olo": ("olo.com",), "clover": ("clover.com",),
    "square": ("square.site", "squareup.com"), "popmenu": ("popmenu.com",),
    "bentobox": ("bentobox.com", "getbento.com"), "owner": ("owner.com",),
    "spothopper": ("spothopper.com", "spothopperapp.com"),
    "slice": ("slicelife.com",), "flipdish": ("flipdish.com",),
    "lightspeed": ("lightspeedhq.com", "lightspeed.app"),
    "gloriafood": ("gloriafood.com", "globalfoodsoft.com"),
    "order_online": ("order.online",),
}
CONTENT_HINT = re.compile(r"\bmenu(?:s)?\b|\border(?:ing)?\b|online[-_ ]?order", re.I)


def digest(value: str) -> str:
    return hashlib.sha256((SALT + value).encode()).hexdigest()[:20]


def normalize_url(value) -> str | None:
    if isinstance(value, list):
        value = value[0] if value else None
    if not isinstance(value, str) or not value.strip():
        return None
    value = value.strip()
    if not urllib.parse.urlsplit(value).scheme:
        value = "https://" + value
    try:
        parsed = urllib.parse.urlsplit(value)
        return value if parsed.hostname and parsed.scheme in ("http", "https") else None
    except ValueError:
        return None


def platform_for(value: str) -> str | None:
    lowered = value.casefold()
    for platform, hints in PLATFORM_HOSTS.items():
        if any(hint in lowered for hint in hints):
            return platform
    return None


def clear_menu_url(value: str) -> bool:
    parsed = urllib.parse.urlsplit(value)
    path = parsed.path
    if re.search(r"(?:^|[-_/])(menu|menus|order|ordering)(?:[-_/]|$)", path, re.I):
        return True
    return bool(
        "eat.chownow.com/discover/restaurant/" in value
        or (parsed.hostname or "").startswith("order.") and path.startswith("/online/")
    )


class PageParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.scripts: list[tuple[str, str]] = []
        self.links: list[tuple[str, str]] = []
        self._script_type: str | None = None
        self._script: list[str] = []
        self._href: str | None = None
        self._anchor: list[str] = []

    def handle_starttag(self, tag, attrs):
        values = dict(attrs)
        if tag == "script":
            self._script_type = values.get("type", "")
            self._script = []
        elif tag == "a":
            self._href = values.get("href")
            self._anchor = []

    def handle_data(self, data):
        if self._script_type is not None:
            self._script.append(data)
        if self._href is not None:
            self._anchor.append(data)

    def handle_endtag(self, tag):
        if tag == "script" and self._script_type is not None:
            self.scripts.append((self._script_type, "".join(self._script)))
            self._script_type = None
        elif tag == "a" and self._href is not None:
            self.links.append((self._href, " ".join(self._anchor)))
            self._href = None


def walk_schema(value, output: list[dict]) -> None:
    if isinstance(value, list):
        for child in value: walk_schema(child, output)
    elif isinstance(value, dict):
        types = value.get("@type", "")
        types = types if isinstance(types, list) else [types]
        if any(str(item).casefold() == "menuitem" for item in types) and isinstance(value.get("name"), str):
            image = value.get("image")
            if isinstance(image, list): image = image[0] if image else None
            if isinstance(image, dict): image = image.get("url") or image.get("contentUrl")
            output.append({"name": value["name"].strip(), "image_url": image if isinstance(image, str) and image.startswith("http") else None, "source": "schema_org"})
        for child in value.values(): walk_schema(child, output)


def walk_embedded(value, output: list[dict], source: str) -> None:
    if isinstance(value, list):
        for child in value: walk_embedded(child, output, source)
    elif isinstance(value, dict):
        name = value.get("name") or value.get("itemName") or value.get("title")
        price = value.get("price", value.get("basePrice", value.get("cost")))
        image = value.get("imageUrl") or value.get("photoUrl") or value.get("thumbnailUrl") or value.get("image")
        if isinstance(image, dict): image = image.get("url") or image.get("src")
        numeric_price = isinstance(price, (int, float)) or isinstance(price, str) and bool(re.fullmatch(r"\s*\$?\d+(?:\.\d+)?\s*", price))
        if isinstance(name, str) and 1 < len(name.strip()) < 100 and numeric_price:
            output.append({"name": name.strip(), "image_url": image if isinstance(image, str) and image.startswith("http") else None, "source": source})
            return
        for child in value.values(): walk_embedded(child, output, source)


def dedupe_items(items: list[dict]) -> tuple[list[dict], int]:
    unique = {}
    for item in items:
        key = re.sub(r"[^a-z0-9]+", " ", html_module.unescape(item["name"]).casefold()).strip()
        if key and (key not in unique or item.get("image_url") and not unique[key].get("image_url")):
            unique[key] = item
    return list(unique.values()), len(items) - len(unique)


def analyze_html(text: str) -> dict:
    parser = PageParser(); parser.feed(text)
    platforms = sorted({p for p in PLATFORM_HOSTS if any(h in text.casefold() for h in PLATFORM_HOSTS[p])})
    schema, embedded = [], []
    for script_type, body in parser.scripts:
        if "json" not in script_type.casefold() and not body.lstrip().startswith(("{", "[")): continue
        try: value = json.loads(body)
        except (json.JSONDecodeError, RecursionError): continue
        before = len(schema); walk_schema(value, schema)
        if len(schema) == before:
            walk_embedded(value, embedded, platforms[0] if platforms else "embedded_json")
    unique, duplicates = dedupe_items(schema + embedded)
    return {"schema_items": len(dedupe_items(schema)[0]), "items": unique, "duplicate_items": duplicates, "platforms": platforms, "links": parser.links}


def choose_link(base_url: str, links: list[tuple[str, str]]) -> str | None:
    try: base = urllib.parse.urlsplit(base_url)
    except ValueError: return None
    candidates = []
    for href, label in links:
        if not href or href.startswith(("#", "mailto:", "tel:", "javascript:")): continue
        try:
            url = urllib.parse.urljoin(base_url, href)
            parsed = urllib.parse.urlsplit(url)
        except ValueError: continue
        if parsed.scheme not in ("http", "https") or re.search(r"\.pdf(?:$|\?)", url, re.I): continue
        platform = platform_for(parsed.hostname or "")
        same_site = parsed.hostname == base.hostname or (parsed.hostname or "").removeprefix("www.") == (base.hostname or "").removeprefix("www.")
        hint = CONTENT_HINT.search(parsed.path + " " + label)
        if not hint:
            continue
        if not platform and not same_site: continue
        clean = urllib.parse.urlunsplit((parsed.scheme, parsed.netloc, parsed.path, parsed.query, ""))
        score = (20 if platform else 0) + (8 if CONTENT_HINT.search(label) else 0) + (4 if CONTENT_HINT.search(parsed.path) else 0) + min(parsed.path.count("/"), 4)
        candidates.append((-score, digest(clean), clean))
    return min(candidates)[2] if candidates else None


def sample_rows(raw_root: Path) -> list[dict]:
    cache = load_web_cache(raw_root / "cycle1-web")
    reviewed = json.loads((Path(__file__).parent / "cycle1_review_fixture.json").read_text())
    known_contradictions = set(reviewed["identity_contradicted"])
    candidates = []
    for region, state in REGIONS.items():
        records = {r["source_record_id"]: r for r in restaurant_records(raw_root / f"cycle1-overture-{region}.geojsonseq")}
        dd_urls = extract_urls((raw_root / "cycle3-doordash" / f"sitemap-{state}.xml").read_text(errors="replace"))
        targets = [t for t in choose_overture_targets(raw_root) if t["area"] == region]
        for target in targets:
            cache_key = cycle1_digest(target["kind"] + "|" + region + "|" + target["source_record_id"])
            if cache_key in known_contradictions:
                continue
            gate = website_disposition(cache[cache_key])
            record = records[target["source_record_id"]]
            url = normalize_url(record["fields"].get("website"))
            dd = match_store(record, dd_urls)["disposition"]
            if gate != "reject" and url and dd in ("matched", "rejected"):
                candidates.append({"region": region, "id": target["source_record_id"], "url": url, "identity_gate": gate, "dd_matched": dd == "matched", "chain": record["chain"]})
    chosen = []
    for key in sorted({(r["region"], r["dd_matched"]) for r in candidates}):
        group = [r for r in candidates if (r["region"], r["dd_matched"]) == key]
        # Two per region × DD stratum. Prefer one of each chain class, then an
        # accepted identity, with salted hashes as the stable final tie-break.
        first = min(group, key=lambda r: (r["identity_gate"] != "accept", digest(r["id"])))
        remainder = [r for r in group if r["id"] != first["id"]]
        opposite = [r for r in remainder if r["chain"] != first["chain"]]
        second = min(opposite or remainder, key=lambda r: (r["identity_gate"] != "accept", digest(r["id"])))
        chosen.extend((first, second))
    if len(chosen) != 24:
        raise ValueError(f"expected 24 selected restaurants, found {len(chosen)}")
    return sorted(chosen, key=lambda r: (r["region"], r["dd_matched"], digest(r["id"])))


def fetch_once(url: str, destination: Path) -> dict:
    started = time.monotonic(); body = b""; status = None; error = None; headers = {}
    request = urllib.request.Request(url, headers={"User-Agent": "SeeFood-DataLab/2.0 bounded-public-research", "Accept": "text/html,image/*;q=.8,*/*;q=.5"})
    try:
        with urllib.request.urlopen(request, timeout=min(TIMEOUT_SECONDS, 44)) as response:
            status = response.status; headers = {k.casefold(): v for k, v in response.headers.items()}; body = response.read(MAX_BODY_BYTES + 1)
    except urllib.error.HTTPError as exc:
        status = exc.code; headers = {k.casefold(): v for k, v in exc.headers.items()}; body = exc.read(2 * 1024 * 1024); error = f"http_{status}"
    except Exception as exc: error = type(exc).__name__.casefold()
    destination.parent.mkdir(parents=True, exist_ok=True); destination.write_bytes(body[:MAX_BODY_BYTES])
    return {"status": status, "content_type": headers.get("content-type", ""), "bytes": min(len(body), MAX_BODY_BYTES), "elapsed_seconds": round(time.monotonic() - started, 3), "blocked": status in (401, 403, 429), "error": error or ("body_too_large" if len(body) > MAX_BODY_BYTES else None)}


def collect(raw_root: Path) -> None:
    out = raw_root / "cycle4-webmenus"; out.mkdir(parents=True, exist_ok=True)
    state_path = out / "collection.json"
    state = json.loads(state_path.read_text()) if state_path.exists() else {"requests": {}, "restaurants": {}}
    selected = sample_rows(raw_root)
    for row in selected:
        key = digest(row["id"]); entry = state["restaurants"].setdefault(key, row | {"pages": []})
        home_key = digest(row["url"])
        if home_key not in state["requests"]:
            state["requests"][home_key] = fetch_once(row["url"], out / "pages" / f"{home_key}.bin") | {"url": row["url"], "kind": "homepage"}
        if not entry["pages"]: entry["pages"].append(home_key)
        meta = state["requests"][home_key]; page = out / "pages" / f"{home_key}.bin"
        if meta.get("status") == 200 and "html" in meta.get("content_type", "").casefold() and page.exists():
            analysis = analyze_html(page.read_text(errors="replace")); link = choose_link(row["url"], analysis["links"])
            already_followed = any(state["requests"].get(page_key, {}).get("kind") == "followed_link" for page_key in entry["pages"])
            if link and not already_followed:
                link_key = digest(link)
                if link_key not in state["requests"] and len(state["requests"]) < MAX_REQUESTS:
                    state["requests"][link_key] = fetch_once(link, out / "pages" / f"{link_key}.bin") | {"url": link, "kind": "followed_link"}
                if link_key in state["requests"] and link_key not in entry["pages"]: entry["pages"].append(link_key)
        state_path.write_text(json.dumps(state, indent=2, sort_keys=True) + "\n")
    # Use remaining request budget for deterministic round-robin item-photo
    # verification: at most one photo per restaurant before taking a second.
    photo_candidates = defaultdict(list)
    for key, entry in state["restaurants"].items():
        for page_key in entry["pages"]:
            page = out / "pages" / f"{page_key}.bin"; meta = state["requests"][page_key]
            if page.exists() and meta.get("status") == 200 and "html" in meta.get("content_type", "").casefold():
                for item in analyze_html(page.read_text(errors="replace"))["items"]:
                    if item.get("image_url"): photo_candidates[key].append(item["image_url"])
    depth = 0
    while len(state["requests"]) < MAX_REQUESTS:
        added = False
        for key in sorted(photo_candidates):
            urls = sorted(set(photo_candidates[key]), key=digest)
            if depth >= len(urls): continue
            url = urls[depth]; request_key = digest(url)
            if request_key in state["requests"]: continue
            state["requests"][request_key] = fetch_once(url, out / "photos" / f"{request_key}.bin") | {"url": url, "kind": "item_photo", "restaurant_hash": key}
            added = True
            if len(state["requests"]) >= MAX_REQUESTS: break
        if not added: break
        depth += 1
    state_path.write_text(json.dumps(state, indent=2, sort_keys=True) + "\n")


def metrics(raw_root: Path, review_fixture: Path | None = None) -> dict:
    out = raw_root / "cycle4-webmenus"; state = json.loads((out / "collection.json").read_text())
    rows = []
    for key, entry in sorted(state["restaurants"].items()):
        all_items, schema_count, duplicate_count, platforms = [], 0, 0, set()
        for page_key in entry["pages"]:
            page = out / "pages" / f"{page_key}.bin"; meta = state["requests"][page_key]
            if page.exists() and meta.get("status") == 200 and "html" in meta.get("content_type", "").casefold():
                found = analyze_html(page.read_text(errors="replace")); all_items += found["items"]; schema_count += found["schema_items"]; duplicate_count += found["duplicate_items"]; platforms.update(found["platforms"])
        items, cross_page_dupes = dedupe_items(all_items); duplicate_count += cross_page_dupes
        successful_menu_pages = []
        for page_key in entry["pages"]:
            meta = state["requests"][page_key]
            if meta.get("status") != 200: continue
            path = urllib.parse.urlsplit(meta["url"]).path
            is_provider_menu = bool(platform_for(meta["url"])) and meta["kind"] == "homepage"
            is_clear_follow = meta["kind"] == "followed_link" and clear_menu_url(meta["url"])
            if is_provider_menu or is_clear_follow: successful_menu_pages.append(meta["url"])
        provider_followed = any(state["requests"][p]["kind"] == "followed_link" and platform_for(state["requests"][p]["url"] or "") and clear_menu_url(state["requests"][p]["url"]) for p in entry["pages"])
        rows.append({"target_hash": key, "region": entry["region"], "identity_gate": entry["identity_gate"], "dd_matched": entry["dd_matched"], "chain": entry["chain"], "provider": sorted(platforms), "provider_link_followed": bool(provider_followed), "menu_found": bool(items or successful_menu_pages), "structured_menu_found": bool(items), "schema_items": schema_count, "items": len(items), "items_with_linked_photos": sum(bool(i.get("image_url")) for i in items), "duplicate_item_inflation": duplicate_count})
    photo_requests = [m for m in state["requests"].values() if m["kind"] == "item_photo"]
    successful_photos = [m for m in photo_requests if m.get("status") == 200 and m.get("bytes", 0) > 0 and m.get("content_type", "").casefold().startswith("image/")]
    content_hashes = set()
    for meta in successful_photos:
        path = out / "photos" / f"{digest(meta['url'])}.bin"
        if path.exists(): content_hashes.add(hashlib.sha256(path.read_bytes()).hexdigest())
    def aggregate(selected):
        return {"restaurants": len(selected), "menus": sum(r["menu_found"] for r in selected), "structured_menus": sum(r["structured_menu_found"] for r in selected), "items": sum(r["items"] for r in selected), "items_with_linked_photos": sum(r["items_with_linked_photos"] for r in selected), "duplicate_item_inflation": sum(r["duplicate_item_inflation"] for r in selected)}
    by_dd = {"matched": aggregate([r for r in rows if r["dd_matched"]]), "unmatched": aggregate([r for r in rows if not r["dd_matched"]])}
    provider_yield = {}
    for provider in sorted({p for r in rows for p in r["provider"]}): provider_yield[provider] = aggregate([r for r in rows if provider in r["provider"]])
    reviewed = json.loads(review_fixture.read_text()) if review_fixture and review_fixture.exists() else {"rows": []}
    followed = [m for m in state["requests"].values() if m["kind"] == "followed_link"]
    request_values = list(state["requests"].values())
    return {"sample": {"design": "deterministic purposive Cycle 2 accepted/quarantined websites; two per region x DoorDash matched/unmatched stratum; chain balance where possible; not a national rate", "restaurants": len(rows), "regions": sorted({r["region"] for r in rows}), "identity_accepted": sum(r["identity_gate"] == "accept" for r in rows), "identity_quarantined": sum(r["identity_gate"] == "quarantine" for r in rows), "chains": sum(r["chain"] for r in rows), "independents": sum(not r["chain"] for r in rows)}, "collection": {"request_cap": MAX_REQUESTS, "requests": len(state["requests"]), "homepages": sum(m["kind"] == "homepage" for m in request_values), "followed_links": len(followed), "clearly_relevant_menu_order_links": sum(clear_menu_url(m["url"]) for m in followed), "early_broad_link_candidates_excluded_from_yield": sum(not clear_menu_url(m["url"]) for m in followed), "item_photo_attempts": len(photo_requests), "blocked": sum(m.get("blocked", False) for m in request_values), "network_or_http_failures": sum(m.get("status") != 200 for m in request_values), "downloaded_bytes": sum(m.get("bytes", 0) for m in request_values), "request_elapsed_seconds": round(sum(m.get("elapsed_seconds", 0) for m in request_values), 3), "maximum_request_elapsed_seconds": max((m.get("elapsed_seconds", 0) for m in request_values), default=0), "timeout_seconds": TIMEOUT_SECONDS, "one_attempt_per_url": len(state["requests"]) == len({m["url"] for m in request_values})}, "yield": {"overall": aggregate(rows), "by_identity_gate": {"accepted": aggregate([r for r in rows if r["identity_gate"] == "accept"]), "quarantined": aggregate([r for r in rows if r["identity_gate"] == "quarantine"])}, "by_doordash_identity": by_dd, "incremental_over_doordash": {"restaurants_with_menu_among_unmatched": by_dd["unmatched"]["menus"], "item_photos_among_unmatched": by_dd["unmatched"]["items_with_linked_photos"]}, "schema_org_items": sum(r["schema_items"] for r in rows), "provider_links_followed": sum(r["provider_link_followed"] for r in rows), "provider_yield": provider_yield, "unique_linked_photo_urls": len({m["url"] for m in photo_requests}), "downloaded_valid_photos": len(successful_photos), "unique_downloaded_photo_content": len(content_hashes), "downloaded_photo_duplicate_inflation": len(successful_photos) - len(content_hashes)}, "sanitized_rows": rows, "review": {"fixture_rows": len(reviewed.get("rows", [])), "menu_corroborated": sum(r.get("menu_label") == "corroborated" for r in reviewed.get("rows", [])), "no_menu_corroborated": sum(r.get("menu_label") == "no_menu_corroborated" for r in reviewed.get("rows", []))}}


def main() -> None:
    root = Path(__file__).parent; parser = argparse.ArgumentParser()
    parser.add_argument("--raw-dir", type=Path, default=root / "raw"); parser.add_argument("--collect", action="store_true"); parser.add_argument("--output", type=Path); parser.add_argument("--review-fixture", type=Path, default=root / "cycle4_review_fixture.json")
    args = parser.parse_args()
    if args.collect: collect(args.raw_dir)
    rendered = json.dumps(metrics(args.raw_dir, args.review_fixture), indent=2, sort_keys=True) + "\n"
    if args.output: args.output.write_text(rendered)
    else: print(rendered, end="")


if __name__ == "__main__": main()
