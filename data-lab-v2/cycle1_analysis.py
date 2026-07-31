#!/usr/bin/env python3
"""Build deterministic, sanitized Cycle 1 metrics from cached bounded samples."""

from __future__ import annotations

import argparse
import json
from collections import Counter
from pathlib import Path

from cycle0_analysis import distance_m, normalized_name, overture_records, present
from cycle1_collect import SAMPLES
from cycle1_webcheck import choose_overture_targets, digest


def duplicate_candidates(records: list[dict], maximum_distance_m: float = 30) -> dict[str, int]:
    """Count exact-name/nearby clusters as candidates, not confirmed duplicates."""
    parents = list(range(len(records)))

    def find(index: int) -> int:
        while parents[index] != index:
            parents[index] = parents[parents[index]]
            index = parents[index]
        return index

    def union(left: int, right: int) -> None:
        a, b = find(left), find(right)
        if a != b:
            parents[b] = a

    names: dict[str, list[int]] = {}
    for index, record in enumerate(records):
        name = normalized_name(record["fields"].get("name"))
        if name:
            names.setdefault(name, []).append(index)
    for indexes in names.values():
        for offset, left in enumerate(indexes):
            for right in indexes[offset + 1 :]:
                if distance_m(records[left], records[right]) <= maximum_distance_m:
                    union(left, right)
    sizes = Counter(find(index) for index in range(len(records)))
    clusters = [size for size in sizes.values() if size > 1]
    return {
        "candidate_clusters": len(clusters),
        "candidate_excess_records": sum(size - 1 for size in clusters),
    }


def duplicate_excess(records: list[dict], maximum_distance_m: float = 30) -> int:
    """Compatibility helper returning excess records across candidate clusters."""
    return duplicate_candidates(records, maximum_distance_m)["candidate_excess_records"]


def load_web_cache(cache_dir: Path) -> dict[str, dict]:
    cache = {}
    for filename in sorted(cache_dir.glob("*.json")):
        row = json.loads(filename.read_text())
        key = row["cache_key"]
        if key in cache:
            raise ValueError(f"duplicate cache key: {key}")
        cache[key] = row
    return cache


def count_lines(path: Path) -> int:
    with path.open() as source:
        return sum(1 for _ in source)


def reviewed_sets(fixture: dict, cache: dict[str, dict], selected_keys: set[str]) -> dict[str, set[str]]:
    sets = {key: set(values) for key, values in fixture.items()}
    identity_groups = (
        sets["identity_contradicted"],
        sets["identity_inconclusive_reachable"],
    )
    if identity_groups[0] & identity_groups[1]:
        raise ValueError("identity review categories overlap")
    reviewed_identity = set().union(*identity_groups)
    if not reviewed_identity <= selected_keys:
        raise ValueError("identity review contains a non-selected cache key")
    if any(not cache[key]["reachable"] for key in reviewed_identity):
        raise ValueError("identity review contains an unreachable website")
    third_party = sets["third_party_identity_corroboration"]
    reachable_keys = {key for key in selected_keys if cache[key]["reachable"]}
    corroborated = reachable_keys - reviewed_identity
    if not third_party <= corroborated:
        raise ValueError("third-party corroboration is not in the corroborated set")
    if not sets["open_status_contradicted"] <= selected_keys:
        raise ValueError("open-status review contains a non-selected cache key")
    if any(cache[key].get("operating_status") != "open" for key in sets["open_status_contradicted"]):
        raise ValueError("open-status contradiction is not provider-open")
    if any(
        cache[key].get("operating_status") != "permanently_closed"
        for key in sets["closed_status_corroborated"]
    ):
        raise ValueError("closed-status corroboration is not provider-closed")
    return sets | {"identity_corroborated": corroborated}


def build_metrics(raw_dir: Path, review_fixture: Path) -> dict:
    fixture = json.loads(review_fixture.read_text())
    by_market = {}
    all_records = []
    for market in SAMPLES:
        path = raw_dir / f"cycle1-overture-{market}.geojsonseq"
        records = list(overture_records(path))
        all_records.extend(records)
        by_market[market] = {
            "all_places": count_lines(path),
            "restaurants": len(records),
        }

    fields = {
        field: sum(present(row["fields"].get(field)) for row in all_records)
        for field in ("address", "phone", "website", "operating_status")
    }
    contacts = Counter(
        (present(row["fields"].get("website")), present(row["fields"].get("phone")))
        for row in all_records
    )

    cache = load_web_cache(raw_dir / "cycle1-web")
    targets = choose_overture_targets(raw_dir)
    selected = [
        cache[digest(row["kind"] + "|" + row["area"] + "|" + row["source_record_id"])]
        for row in targets
    ]
    selected_keys = {row["cache_key"] for row in selected}
    if len(selected_keys) != len(selected):
        raise ValueError("selected website targets are not unique")
    reachable = [row for row in selected if row["reachable"]]
    reviews = reviewed_sets(fixture, cache, selected_keys)
    contradicted = reviews["identity_contradicted"]
    inconclusive = reviews["identity_inconclusive_reachable"]
    third_party = reviews["third_party_identity_corroboration"]
    corroborated = reviews["identity_corroborated"]

    omission_rows = [row for row in cache.values() if row["kind"] == "omission_candidate"]
    omission_keys = {row["cache_key"] for row in omission_rows}
    omission_high = reviews["omission_high_confidence"]
    matcher_false = reviews["omission_matcher_false_negative"]
    if omission_high & matcher_false or not (omission_high | matcher_false) <= omission_keys:
        raise ValueError("invalid omission review partition")

    status_counts = Counter(row["operating_status"] or "unknown" for row in selected)
    duplicate_counts = duplicate_candidates(all_records)
    metrics = {
        "sample": {
            "design": "purposive six-market bounded boxes; counts are not national rates",
            "markets": list(SAMPLES),
            "all_overture_places": sum(row["all_places"] for row in by_market.values()),
            "overture_restaurants": len(all_records),
            "by_market": by_market,
        },
        "fields": {
            **fields,
            "website_without_phone": contacts[(True, False)],
            "phone_without_website": contacts[(False, True)],
        },
        "identity_accuracy_selected": {
            "selected_records": len(selected),
            "decisive_denominator": len(corroborated | contradicted),
            "corroborated": len(corroborated),
            "contradicted": len(contradicted),
            "not_decisive": len(selected) - len(corroborated | contradicted),
        },
        "website_reachability_selected": {
            "denominator": len(selected),
            "http_reachable": len(reachable),
            "unreachable_blocked_or_error": len(selected) - len(reachable),
        },
        "website_accuracy_selected": {
            "reachable_denominator": len(reachable),
            "local_identity_corroborating": len(corroborated - third_party),
            "third_party_identity_corroborating": len(corroborated & third_party),
            "identity_contradicted": len(contradicted),
            "identity_inconclusive": len(inconclusive),
        },
        "operating_status_selected": {
            "denominator": len(selected),
            "provider_open": status_counts["open"],
            "provider_unknown": status_counts["unknown"],
            "provider_permanently_closed": status_counts["permanently_closed"],
            "open_contradicted_by_public_evidence": len(reviews["open_status_contradicted"]),
            "open_not_contradicted_or_not_verified": status_counts["open"]
            - len(reviews["open_status_contradicted"]),
            "permanently_closed_corroborated": len(reviews["closed_status_corroborated"]),
        },
        "duplicate_candidates": {
            "denominator": len(all_records),
            "rule": "exact normalized name connected within 30m; candidates only",
            **duplicate_counts,
        },
        "osm_omission_candidates": {
            "denominator": len(omission_rows),
            "high_confidence_omissions": len(omission_high),
            "matcher_false_negatives": len(matcher_false),
            "inconclusive_or_stale_candidates": len(omission_rows) - len(omission_high | matcher_false),
        },
        "collection": {
            "overture_release": "2026-07-22.0",
            "overture_download_bytes": sum(
                (raw_dir / f"cycle1-overture-{market}.geojsonseq").stat().st_size
                for market in SAMPLES
            ),
            "overture_request_limit_seconds": 90,
            "hard_operation_limit_seconds": 120,
            "cached_web_checks": len(cache),
            "website_request_timeout_seconds": 20,
            "maximum_observed_website_elapsed_seconds": max(
                (row["elapsed_seconds"] for row in cache.values()), default=0
            ),
            "new_osm_sample": "unavailable: primary 504; one alternate timed out at 90s; stopped",
        },
    }
    return metrics


def main() -> None:
    parser = argparse.ArgumentParser()
    root = Path(__file__).parent
    parser.add_argument("--raw-dir", type=Path, default=root / "raw")
    parser.add_argument("--review-fixture", type=Path, default=root / "cycle1_review_fixture.json")
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    rendered = json.dumps(build_metrics(args.raw_dir, args.review_fixture), indent=2, sort_keys=True) + "\n"
    if args.output:
        args.output.write_text(rendered)
    else:
        print(rendered, end="")


if __name__ == "__main__":
    main()
