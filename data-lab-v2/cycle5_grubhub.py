#!/usr/bin/env python3
"""Cycle 5: bounded rendered-Grubhub collector and sanitized analyzer.

The collector runs the public Grubhub SPA in the existing crawler browser
environment, sequentially. It captures only the SPA's own client-visible,
first-party menu responses. Raw HTML, JSON, URLs, and image bytes remain under
the ignored ``raw/cycle5-grubhub`` directory.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import subprocess
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter, defaultdict
from pathlib import Path

from cycle3_doordash import restaurant_records

REGIONS = (
    "albuquerque_nm", "boone_nc", "jackson_ms", "portland_me",
    "spokane_wa", "wichita_ks",
)
LOCATION_LABELS = {
    "albuquerque_nm": "Albuquerque, NM", "boone_nc": "Boone, NC",
    "jackson_ms": "Jackson, MS", "portland_me": "Portland, ME",
    "spokane_wa": "Spokane, WA", "wichita_ks": "Wichita, KS",
}
# One chain and one independent per market. Across the twelve: six each for
# DoorDash matched/unmatched and Cycle 2 website accepted/quarantined. These
# are salted Cycle 4 hashes, not source or production identifiers.
TARGET_HASHES = {
    "0f120dc134e3eeaad46f", "78660ccfb62c67e059ee",
    "334c0bb0025e930a59c4", "426cbd57308ec75f6368",
    "033cd5b47ac96ee1f7be", "c98fd0728019699f7dab",
    "28cbf283508789a55e63", "58fe9930fb9047dc3655",
    "02454737a37f6ba086fe", "19cda118762ab91e7909",
    "323446b1ff63fd06578f", "1f62c3d73ee5c3e616b8",
}
SALT = "seefood-cycle5|"
MAX_TARGETS = 12
MAX_BROWSER_OPERATIONS = 24
BROWSER_TIMEOUT_SECONDS = 50
PROCESS_TIMEOUT_SECONDS = 60
MAX_PHOTO_DOWNLOADS = 48
PHOTO_TIMEOUT_SECONDS = 12
MAX_PHOTO_BYTES = 12 * 1024 * 1024
GENERIC = {
    "and", "bar", "bbq", "cafe", "company", "cuisine", "deli", "eatery",
    "food", "foods", "grill", "house", "kitchen", "restaurant", "the",
}


def digest(value: str) -> str:
    return hashlib.sha256((SALT + value).encode()).hexdigest()[:20]


def words(value: str | None) -> list[str]:
    text = unicodedata.normalize("NFKD", (value or "").casefold())
    text = "".join(char for char in text if not unicodedata.combining(char))
    text = text.replace("'", "").replace("’", "")
    return re.findall(r"[a-z0-9]+", text)


def _cycle4_rows(root: Path) -> tuple[dict, dict]:
    state = json.loads((root / "raw/cycle4-webmenus/collection.json").read_text())
    metrics = json.loads((root / "CYCLE4_METRICS.json").read_text())
    return state["restaurants"], {row["target_hash"]: row for row in metrics["sanitized_rows"]}


def sample_rows(root: Path) -> list[dict]:
    cycle4, metrics = _cycle4_rows(root)
    records = {}
    for region in REGIONS:
        path = root / f"raw/cycle1-overture-{region}.geojsonseq"
        for record in restaurant_records(path):
            records[record["source_record_id"]] = record
    selected = []
    for target_hash in sorted(TARGET_HASHES):
        entry = cycle4[target_hash]
        record = records[entry["id"]]
        address = record["fields"].get("address") or {}
        selected.append({
            "target_hash": target_hash,
            "source_record_id": entry["id"],
            "region": entry["region"],
            "chain": entry["chain"],
            "dd_matched": entry["dd_matched"],
            "website_identity_gate": entry["identity_gate"],
            "website_menu_found": metrics[target_hash]["menu_found"],
            "name": record["fields"]["name"],
            "address": address.get("freeform") or "",
            "locality": address.get("locality") or "",
            "region_code": address.get("region") or "",
            "longitude": record["longitude"],
            "latitude": record["latitude"],
        })
    selected.sort(key=lambda row: (row["region"], row["chain"], row["target_hash"]))
    assert len(selected) == MAX_TARGETS
    assert Counter(row["region"] for row in selected) == Counter({r: 2 for r in REGIONS})
    assert sum(row["chain"] for row in selected) == 6
    assert sum(row["dd_matched"] for row in selected) == 6
    assert sum(row["website_identity_gate"] == "accept" for row in selected) == 6
    return selected


def search_url(row: dict) -> str:
    query = urllib.parse.urlencode({
        "queryText": row["name"], "latitude": row["latitude"],
        "longitude": row["longitude"], "orderMethod": "delivery",
    })
    return "https://www.grubhub.com/search?" + query


def search_candidates(html: str) -> list[str]:
    found = re.findall(r'''["'](/restaurant/[^"'?#]+/\d{5,}/?)["']''', html, re.I)
    return sorted({"https://www.grubhub.com" + value.rstrip("/") + "/" for value in found})


def strict_store_match(html: str, row: dict) -> dict:
    candidates = search_candidates(html)
    target = words(row["name"])
    distinctive = [word for word in target if word not in GENERIC]
    locality = set(words(row["locality"]))
    street_numbers = set(re.findall(r"\b\d+[a-z]?\b", row["address"].casefold()))
    safe = []
    plausible = []
    for url in candidates:
        slug = set(words(urllib.parse.unquote(urllib.parse.urlsplit(url).path)))
        overlap = sum(word in slug for word in distinctive)
        coverage = overlap / len(distinctive) if distinctive else 0
        name_ok = bool(distinctive) and distinctive[0] in slug and coverage >= 0.8
        city_ok = bool(locality) and locality.issubset(slug)
        address_ok = bool(street_numbers & slug)
        if name_ok and city_ok:
            plausible.append(url)
            if address_ok:
                safe.append(url)
    if len(safe) == 1:
        return {"disposition": "safe_match", "url": safe[0], "candidate_count": len(candidates)}
    if len(safe) > 1:
        return {"disposition": "quarantine_ambiguous", "candidate_count": len(candidates)}
    reason = "no_result" if not candidates else "no_strict_location_match"
    if len(plausible) > 1:
        reason = "quarantine_ambiguous"
    return {"disposition": reason, "candidate_count": len(candidates)}


def run_browser(fetch_script: Path, python: Path, url: str, *, location: str | None = None,
                capture_menu: bool = False) -> tuple[dict, float]:
    args = [str(python), str(fetch_script), url, "--render", "--timeout", str(BROWSER_TIMEOUT_SECONDS), "--wait-ms", "1000"]
    if location:
        args.extend(["--wait-selector", 'a[href*="/restaurant/"]', "--grubhub-search-location", location])
    if capture_menu:
        args.append("--capture-grubhub-menu")
    started = time.monotonic()
    try:
        result = subprocess.run(args, capture_output=True, text=True, timeout=PROCESS_TIMEOUT_SECONDS, check=False)
        elapsed = round(time.monotonic() - started, 3)
    except subprocess.TimeoutExpired:
        return {"ok": False, "status": None, "error": "process_timeout"}, round(time.monotonic() - started, 3)
    if result.returncode != 0:
        return {"ok": False, "status": None, "error": "browser_process_error"}, elapsed
    try:
        return json.loads(result.stdout.strip()), elapsed
    except json.JSONDecodeError:
        return {"ok": False, "status": None, "error": "invalid_browser_output"}, elapsed


def tooling_failure(result: dict) -> bool:
    error = str(result.get("error") or "").casefold()
    return result.get("status") is None and any(token in error for token in (
        "timeout", "browser", "camou", "firefox", "invalid_browser", "process",
    ))


def collect(root: Path, python: Path, fetch_script: Path) -> None:
    raw = root / "raw/cycle5-grubhub"
    raw.mkdir(parents=True, exist_ok=True)
    state_path = raw / "collection.json"
    state = json.loads(state_path.read_text()) if state_path.exists() else {
        "browser_operations": [], "targets": {}, "stopped_after_tooling_failures": False,
    }
    operations = state["browser_operations"]
    attempted_urls = {row["url"] for row in operations}
    consecutive_tool_failures = 0
    for target in sample_rows(root):
        key = target["target_hash"]
        entry = state["targets"].setdefault(key, {
            k: target[k] for k in (
                "region", "chain", "dd_matched", "website_identity_gate", "website_menu_found"
            )
        })
        url = search_url(target)
        if "search" not in entry and url not in attempted_urls and len(operations) < MAX_BROWSER_OPERATIONS:
            result, elapsed = run_browser(fetch_script, python, url, location=LOCATION_LABELS[target["region"]])
            raw_result = raw / f"search-{key}.json"
            raw_result.write_text(json.dumps(result))
            outcome = strict_store_match(result.get("html") or "", target) if result.get("ok") else {
                "disposition": "search_failure", "candidate_count": 0,
            }
            entry["search"] = {
                "ok": bool(result.get("ok")), "status": result.get("status"),
                "error": result.get("error"), "elapsed_seconds": elapsed, **outcome,
            }
            operations.append({"kind": "search", "target_hash": key, "url": url, "elapsed_seconds": elapsed})
            attempted_urls.add(url)
            consecutive_tool_failures = consecutive_tool_failures + 1 if tooling_failure(result) else 0
            state_path.write_text(json.dumps(state, indent=2, sort_keys=True) + "\n")
            if consecutive_tool_failures >= 3:
                state["stopped_after_tooling_failures"] = True
                state_path.write_text(json.dumps(state, indent=2, sort_keys=True) + "\n")
                break
        if entry.get("search", {}).get("disposition") != "safe_match":
            continue
        store_url = strict_store_match(json.loads((raw / f"search-{key}.json").read_text()).get("html") or "", target).get("url")
        if not store_url or "store" in entry or store_url in attempted_urls or len(operations) >= MAX_BROWSER_OPERATIONS:
            continue
        result, elapsed = run_browser(fetch_script, python, store_url, capture_menu=True)
        (raw / f"store-{key}.json").write_text(json.dumps(result))
        entry["store"] = {
            "ok": bool(result.get("ok")), "status": result.get("status"),
            "error": result.get("error"), "elapsed_seconds": elapsed,
        }
        operations.append({"kind": "store", "target_hash": key, "url": store_url, "elapsed_seconds": elapsed})
        attempted_urls.add(store_url)
        consecutive_tool_failures = consecutive_tool_failures + 1 if tooling_failure(result) else 0
        state_path.write_text(json.dumps(state, indent=2, sort_keys=True) + "\n")
        if consecutive_tool_failures >= 3:
            state["stopped_after_tooling_failures"] = True
            state_path.write_text(json.dumps(state, indent=2, sort_keys=True) + "\n")
            break
    if len(operations) > MAX_BROWSER_OPERATIONS or len(attempted_urls) != len(operations):
        raise ValueError("browser operation budget or one-attempt invariant violated")


def media_url(value) -> str | None:
    if not isinstance(value, dict):
        return None
    base, public_id = value.get("base_url"), value.get("public_id")
    if isinstance(base, str) and base.startswith("http") and isinstance(public_id, str) and public_id:
        return f"{base}w_800,q_auto:good,fl_lossy,f_auto/{public_id}"
    return None


def extract_items(value, output: list[dict]) -> None:
    if isinstance(value, list):
        for child in value: extract_items(child, output)
        return
    if not isinstance(value, dict):
        return
    name = value.get("item_name")
    has_identity = isinstance(value.get("item_id"), str) or isinstance(value.get("menu_category_id"), str)
    price = value.get("item_price")
    image = media_url(value.get("media_image"))
    if not image and isinstance(value.get("media_images"), list) and value["media_images"]:
        image = media_url(value["media_images"][0])
    if has_identity and isinstance(name, str) and len(name.strip()) > 1 and (
        isinstance(value.get("item_description"), str) or isinstance(price, (int, float, dict)) or image
    ):
        output.append({"name": name.strip(), "image_url": image})
    for child in value.values():
        if isinstance(child, (dict, list)): extract_items(child, output)


def dedupe_items(items: list[dict]) -> tuple[list[dict], int]:
    unique = {}
    for item in items:
        key = " ".join(words(item["name"]))
        if key and (key not in unique or item.get("image_url") and not unique[key].get("image_url")):
            unique[key] = item
    return list(unique.values()), len(items) - len(unique)


def download_photos(root: Path) -> None:
    raw = root / "raw/cycle5-grubhub"
    state_path = raw / "collection.json"
    state = json.loads(state_path.read_text())
    state.setdefault("photo_downloads", {})
    candidates = defaultdict(list)
    for key, entry in state["targets"].items():
        path = raw / f"store-{key}.json"
        if not path.exists() or not entry.get("store", {}).get("ok"): continue
        payloads = json.loads(path.read_text()).get("payloads") or []
        observed = []; extract_items(payloads, observed)
        items, _ = dedupe_items(observed)
        candidates[key] = sorted({item["image_url"] for item in items if item.get("image_url")}, key=digest)
    queue = []
    depth = 0
    while len(queue) < MAX_PHOTO_DOWNLOADS:
        added = False
        for key in sorted(candidates):
            if depth < len(candidates[key]):
                queue.append((key, candidates[key][depth])); added = True
                if len(queue) == MAX_PHOTO_DOWNLOADS: break
        if not added: break
        depth += 1
    for key, url in queue:
        photo_key = digest(url)
        if photo_key in state["photo_downloads"]: continue
        started = time.monotonic(); status = None; content_type = ""; body = b""; error = None
        try:
            request = urllib.request.Request(url, headers={"Accept": "image/*", "User-Agent": "SeeFood-DataLab/2.0 bounded-public-research"})
            with urllib.request.urlopen(request, timeout=PHOTO_TIMEOUT_SECONDS) as response:
                status = response.status; content_type = response.headers.get("content-type", "")
                body = response.read(MAX_PHOTO_BYTES + 1)
        except urllib.error.HTTPError as exc:
            status = exc.code; error = f"http_{status}"
        except Exception as exc:
            error = type(exc).__name__.casefold()
        valid = status == 200 and content_type.casefold().startswith("image/") and 0 < len(body) <= MAX_PHOTO_BYTES
        if valid: (raw / "photos").mkdir(exist_ok=True); (raw / "photos" / f"{photo_key}.bin").write_bytes(body)
        state["photo_downloads"][photo_key] = {
            "target_hash": key, "status": status, "content_type": content_type,
            "bytes": min(len(body), MAX_PHOTO_BYTES), "valid": valid, "error": error,
            "elapsed_seconds": round(time.monotonic() - started, 3),
        }
        state_path.write_text(json.dumps(state, indent=2, sort_keys=True) + "\n")


def analyze(root: Path, review_fixture: Path | None = None) -> dict:
    raw = root / "raw/cycle5-grubhub"
    state = json.loads((raw / "collection.json").read_text())
    rows = []
    for target in sample_rows(root):
        key = target["target_hash"]; entry = state["targets"].get(key, {})
        observed = []
        store_path = raw / f"store-{key}.json"
        if store_path.exists() and entry.get("store", {}).get("ok"):
            extract_items(json.loads(store_path.read_text()).get("payloads") or [], observed)
        items, inflation = dedupe_items(observed)
        photo_urls = {item["image_url"] for item in items if item.get("image_url")}
        rows.append({
            "target_hash": key, "region": target["region"], "chain": target["chain"],
            "dd_matched": target["dd_matched"], "website_menu_found": target["website_menu_found"],
            "website_identity_gate": target["website_identity_gate"],
            "search_attempted": "search" in entry,
            "search_disposition": entry.get("search", {}).get("disposition", "not_attempted"),
            "store_attempted": "store" in entry, "store_ok": bool(entry.get("store", {}).get("ok")),
            "menu": bool(items), "item_observations": len(observed), "items": len(items),
            "duplicate_item_inflation": inflation, "items_with_photos": sum(bool(i.get("image_url")) for i in items),
            "unique_photo_urls": len(photo_urls), "menu_photo_links": sum(bool(i.get("image_url")) for i in items),
        })
    downloads = state.get("photo_downloads", {})
    valid_hashes = []
    for key, meta in downloads.items():
        path = raw / "photos" / f"{key}.bin"
        if meta.get("valid") and path.exists(): valid_hashes.append(hashlib.sha256(path.read_bytes()).hexdigest())
    fixture = json.loads(review_fixture.read_text()) if review_fixture and review_fixture.exists() else {"rows": []}
    observed_dispositions = {row["target_hash"]: row["search_disposition"] for row in rows}
    if any(row["target_hash"] not in observed_dispositions for row in fixture.get("rows", [])):
        raise ValueError("review fixture contains a target outside the fixed sample")
    if any(observed_dispositions[row["target_hash"]] != row["evaluated_disposition"] for row in fixture.get("rows", [])):
        raise ValueError("review fixture disposition drifted from evaluator")
    labels = Counter(row["review_label"] for row in fixture.get("rows", []))
    searches = [row for row in rows if row["search_attempted"]]
    stores = [row for row in rows if row["store_attempted"]]
    operations = state["browser_operations"]
    return {
        "sample": {
            "design": "deterministic purposive Cycle 4 subset; two per Cycle 1 market, balanced chain and DoorDash overlap; not a national probability sample",
            "restaurants": len(rows), "regions": list(REGIONS), "chains": sum(r["chain"] for r in rows),
            "independents": sum(not r["chain"] for r in rows), "doordash_matched": sum(r["dd_matched"] for r in rows),
            "doordash_unmatched": sum(not r["dd_matched"] for r in rows),
            "website_menu_found": sum(r["website_menu_found"] for r in rows),
            "website_menu_not_found": sum(not r["website_menu_found"] for r in rows),
            "website_identity_accepted": sum(r["website_identity_gate"] == "accept" for r in rows),
            "website_identity_quarantined": sum(r["website_identity_gate"] == "quarantine" for r in rows),
        },
        "collection": {
            "browser_operation_cap": MAX_BROWSER_OPERATIONS, "browser_operations": len(operations),
            "search_attempts": len(searches),
            "rendered_search_pages_ok": sum(bool(state["targets"][r["target_hash"]].get("search", {}).get("ok")) for r in searches),
            "search_pages_with_restaurant_candidates": sum(state["targets"][r["target_hash"]].get("search", {}).get("candidate_count", 0) > 0 for r in searches),
            "minimum_restaurant_candidates_on_search_page": min((state["targets"][r["target_hash"]].get("search", {}).get("candidate_count", 0) for r in searches), default=0),
            "maximum_restaurant_candidates_on_search_page": max((state["targets"][r["target_hash"]].get("search", {}).get("candidate_count", 0) for r in searches), default=0),
            "safe_store_matches": sum(r["search_disposition"] == "safe_match" for r in searches),
            "quarantined_or_no_match_searches": sum(r["search_disposition"] != "safe_match" for r in searches),
            "store_attempts": len(stores), "successful_store_fetches": sum(r["store_ok"] for r in stores),
            "menus": sum(r["menu"] for r in stores), "one_attempt_per_url": len({o["url"] for o in operations}) == len(operations),
            "operation_timeout_seconds": BROWSER_TIMEOUT_SECONDS,
            "maximum_operation_elapsed_seconds": max((o["elapsed_seconds"] for o in operations), default=0),
            "browser_elapsed_seconds": round(sum(o["elapsed_seconds"] for o in operations), 3),
            "stopped_after_three_tooling_failures": state.get("stopped_after_tooling_failures", False),
            "failure_classes": dict(Counter(
                ("search_" + r["search_disposition"]) for r in searches if r["search_disposition"] != "safe_match"
            ) | Counter("store_failed" for r in stores if not r["store_ok"])),
        },
        "yield": {
            "item_observations": sum(r["item_observations"] for r in rows), "items": sum(r["items"] for r in rows),
            "duplicate_item_inflation": sum(r["duplicate_item_inflation"] for r in rows),
            "items_with_photos": sum(r["items_with_photos"] for r in rows),
            "unique_photo_urls": sum(r["unique_photo_urls"] for r in rows),
            "menu_photo_links": sum(r["menu_photo_links"] for r in rows),
            "photo_download_cap": MAX_PHOTO_DOWNLOADS, "photo_download_attempts": len(downloads),
            "valid_photo_downloads": sum(m.get("valid", False) for m in downloads.values()),
            "unique_photo_content_hashes": len(set(valid_hashes)),
            "downloaded_photo_duplicate_inflation": len(valid_hashes) - len(set(valid_hashes)),
            "by_doordash_identity": {
                label: {"restaurants": len(group), "menus": sum(r["menu"] for r in group), "items": sum(r["items"] for r in group), "items_with_photos": sum(r["items_with_photos"] for r in group)}
                for label, group in (("matched", [r for r in rows if r["dd_matched"]]), ("unmatched", [r for r in rows if not r["dd_matched"]]))
            },
            "by_website_menu": {
                label: {"restaurants": len(group), "grubhub_menus": sum(r["menu"] for r in group), "items": sum(r["items"] for r in group), "items_with_photos": sum(r["items_with_photos"] for r in group)}
                for label, group in (("found", [r for r in rows if r["website_menu_found"]]), ("not_found", [r for r in rows if not r["website_menu_found"]]))
            },
        },
        "review": {"fixture_rows": len(fixture.get("rows", [])), **dict(labels)},
        "prior_july_evidence_not_this_sample": {
            "historical_attempts_before_fix": 270, "historical_items_before_fix": 0,
            "accepted_two_restaurant_pilot_items": 325, "accepted_two_restaurant_pilot_unique_photos": 149,
            "rejected_pilot_items_deactivated": 172, "rejected_pilot_photos_deactivated": 46,
            "source": "read-only July 2026 HANDOFF.md and DECISIONS.md; not remeasured or national",
        },
        "sanitized_rows": rows,
    }


def main() -> None:
    root = Path(__file__).parent
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=("plan", "collect", "download-photos", "analyze"))
    parser.add_argument("--python", type=Path)
    parser.add_argument("--fetch-script", type=Path, default=root.parent / "crawler/fetch.py")
    parser.add_argument("--output", type=Path)
    parser.add_argument("--review-fixture", type=Path, default=root / "cycle5_review_fixture.json")
    args = parser.parse_args()
    if args.command == "plan":
        print(json.dumps([{k: row[k] for k in ("target_hash", "region", "chain", "dd_matched", "website_menu_found", "website_identity_gate")} for row in sample_rows(root)], indent=2))
        return
    if args.command == "collect":
        if not args.python: parser.error("collect requires --python")
        collect(root, args.python, args.fetch_script); return
    if args.command == "download-photos": download_photos(root); return
    rendered = json.dumps(analyze(root, args.review_fixture), indent=2, sort_keys=True) + "\n"
    if args.output: args.output.write_text(rendered)
    else: print(rendered, end="")


if __name__ == "__main__": main()
