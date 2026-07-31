#!/usr/bin/env python3
"""Cache bounded public website reachability/content checks for Cycle 1.

HTTP success is only a reachability observation. It is never treated as proof
that a restaurant is currently operating. Explicit blocks and errors are cached
without retries or bypass attempts.
"""

from __future__ import annotations

import argparse
import concurrent.futures
import hashlib
import json
import re
import socket
import ssl
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

from cycle0_analysis import AREAS as CYCLE0_AREAS
from cycle0_analysis import match_records, normalized_name, osm_records, overture_records
from cycle1_collect import SAMPLES


USER_AGENT = "SeeFood-DataLab/2.0 public-research"
PER_REQUEST_TIMEOUT_SECONDS = 20
MAX_BODY_BYTES = 262_144


def digest(value: str) -> str:
    return hashlib.sha256(("seefood-cycle1:" + value).encode()).hexdigest()


def choose_overture_targets(raw_dir: Path) -> list[dict]:
    targets = []
    for area in SAMPLES:
        records = list(overture_records(raw_dir / f"cycle1-overture-{area}.geojsonseq"))
        usable = [row for row in records if row["fields"].get("website")]
        groups = {
            "open": [row for row in usable if row["fields"].get("operating_status") == "open"],
            "unknown": [row for row in usable if not row["fields"].get("operating_status")],
            "closed": [row for row in usable if row["fields"].get("operating_status") == "permanently_closed"],
        }
        selected = []
        for label, limit in (("closed", 20), ("unknown", 6), ("open", 12)):
            selected.extend(sorted(groups[label], key=lambda row: digest(area + row["source_record_id"]))[:limit])
        selected_ids = {row["source_record_id"] for row in selected}
        selected.extend(
            row
            for row in sorted(usable, key=lambda row: digest("fill:" + area + row["source_record_id"]))
            if row["source_record_id"] not in selected_ids
        )
        for row in selected[:20]:
            targets.append({
                "kind": "overture_identity",
                "area": area,
                "source_record_id": row["source_record_id"],
                "name": row["fields"].get("name"),
                "operating_status": row["fields"].get("operating_status"),
                "url": row["fields"]["website"][0],
            })
    return targets


def choose_omission_targets(raw_dir: Path) -> list[dict]:
    targets = []
    for area in CYCLE0_AREAS:
        overture = list(overture_records(raw_dir / f"overture-{area}.geojsonseq"))
        osm = list(osm_records(raw_dir / f"osm-{area}.json"))
        _, unresolved = match_records(osm, overture)
        candidates = [row for row in unresolved if row["fields"].get("website")]
        for row in sorted(candidates, key=lambda item: digest(area + item["source_record_id"]))[:5]:
            targets.append({
                "kind": "omission_candidate",
                "area": area,
                "source_record_id": row["source_record_id"],
                "name": row["fields"].get("name"),
                "operating_status": None,
                "url": row["fields"]["website"],
            })
    return targets


def extract_title(text: str) -> str | None:
    match = re.search(r"<title[^>]*>(.*?)</title>", text, re.I | re.S)
    if not match:
        return None
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", match.group(1))).strip()[:300]


def fetch(target: dict, cache_dir: Path) -> dict:
    cache_key = digest(target["kind"] + "|" + target["area"] + "|" + target["source_record_id"])
    output = cache_dir / f"{cache_key}.json"
    if output.exists() and output.stat().st_size:
        return json.loads(output.read_text())
    started = datetime.now(timezone.utc)
    result = {
        **target,
        "cache_key": cache_key,
        "checked_at": started.isoformat(),
        "reachable": False,
        "http_status": None,
        "final_url": None,
        "content_type": None,
        "title": None,
        "body_text_sample": None,
        "error": None,
    }
    try:
        request = urllib.request.Request(
            target["url"],
            headers={"User-Agent": USER_AGENT, "Accept": "text/html,application/xhtml+xml"},
        )
        with urllib.request.urlopen(request, timeout=PER_REQUEST_TIMEOUT_SECONDS) as response:
            body = response.read(MAX_BODY_BYTES)
            result["http_status"] = response.status
            result["final_url"] = response.geturl()
            result["content_type"] = response.headers.get_content_type()
            result["reachable"] = 200 <= response.status < 400
            if result["content_type"] in ("text/html", "application/xhtml+xml", "text/plain"):
                encoding = response.headers.get_content_charset() or "utf-8"
                text = body.decode(encoding, errors="replace")
                result["title"] = extract_title(text)
                result["body_text_sample"] = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", text))[:20_000]
    except urllib.error.HTTPError as error:
        result["http_status"] = error.code
        result["final_url"] = error.geturl()
        result["error"] = f"http_error:{error.code}"
    except (urllib.error.URLError, TimeoutError, socket.timeout, ssl.SSLError, ValueError) as error:
        result["error"] = f"{type(error).__name__}:{str(error)[:240]}"
    result["elapsed_seconds"] = round((datetime.now(timezone.utc) - started).total_seconds(), 3)
    output.write_text(json.dumps(result, indent=2, sort_keys=True) + "\n")
    return result


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--raw-dir", type=Path, default=Path(__file__).parent / "raw")
    parser.add_argument("--cache-dir", type=Path, default=Path(__file__).parent / "raw/cycle1-web")
    parser.add_argument("--limit", type=int)
    parser.add_argument("--workers", type=int, default=6)
    args = parser.parse_args()
    args.cache_dir.mkdir(parents=True, exist_ok=True)
    targets = choose_overture_targets(args.raw_dir) + choose_omission_targets(args.raw_dir)
    if args.limit is not None:
        targets = targets[: args.limit]
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as executor:
        results = list(executor.map(lambda item: fetch(item, args.cache_dir), targets))
    summary = {
        "targets": len(results),
        "reachable": sum(row["reachable"] for row in results),
        "blocked_or_error": sum(not row["reachable"] for row in results),
        "max_elapsed_seconds": max((row["elapsed_seconds"] for row in results), default=0),
    }
    print(json.dumps(summary, sort_keys=True))


if __name__ == "__main__":
    main()
