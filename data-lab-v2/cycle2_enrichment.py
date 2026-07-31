#!/usr/bin/env python3
"""Deterministic Cycle 2 identity enrichment and quality gates over cached evidence."""

from __future__ import annotations

import argparse
import difflib
import hashlib
import json
import re
import urllib.parse
from collections import Counter
from pathlib import Path

from cycle0_analysis import AREAS, distance_m, match_records, normalized_name, osm_records, overture_records
from cycle1_analysis import duplicate_candidates, load_web_cache
from cycle1_collect import SAMPLES
from cycle1_webcheck import choose_overture_targets, digest as cycle1_digest

MAX_LINK_DISTANCE_M = 150
GENERIC_NAME_TOKENS = {"and", "bar", "cafe", "company", "restaurant", "the"}


def digest(value: str) -> str:
    return hashlib.sha256(("seefood-cycle2:" + value).encode()).hexdigest()


def domain(value) -> str | None:
    if isinstance(value, list):
        value = value[0] if value else None
    if not value:
        return None
    host = (urllib.parse.urlsplit(value if "://" in value else "//" + value).hostname or "").lower()
    return host.removeprefix("www.") or None


def phone(value) -> str | None:
    if isinstance(value, list):
        value = value[0] if value else None
    digits = re.sub(r"\D", "", value or "")
    return digits[-10:] if len(digits) >= 10 else None


def address_parts(value) -> tuple[str | None, str | None, str | None]:
    if not value:
        return None, None, None
    if "freeform" in value:
        text = normalized_name(value.get("freeform"))
        match = re.match(r"(\d+[a-z]?)\s+(.+)", text)
        house, street = match.groups() if match else (None, text)
        postcode = str(value.get("postcode") or "")[:5] or None
    else:
        house = normalized_name(value.get("housenumber")) or None
        street = normalized_name(value.get("street")) or None
        postcode = str(value.get("postcode") or "")[:5] or None
    replacements = {
        "avenue": "ave", "boulevard": "blvd", "court": "ct", "east": "e",
        "north": "n", "road": "rd", "south": "s", "street": "st", "west": "w",
    }
    street = " ".join(replacements.get(token, token) for token in (street or "").split()) or None
    return house, street, postcode


def name_evidence(left: str | None, right: str | None) -> tuple[float, bool]:
    a, b = normalized_name(left), normalized_name(right)
    similarity = difflib.SequenceMatcher(None, a, b).ratio() if a and b else 0.0
    ta = set(a.split()) - GENERIC_NAME_TOKENS
    tb = set(b.split()) - GENERIC_NAME_TOKENS
    distinctive_overlap = bool(ta & tb)
    return similarity, distinctive_overlap


def link_features(left: dict, right: dict) -> dict:
    meters = distance_m(left, right)
    similarity, distinctive_overlap = name_evidence(
        left["fields"].get("name"), right["fields"].get("name")
    )
    left_address, right_address = address_parts(left["fields"].get("address")), address_parts(right["fields"].get("address"))
    address_equal = bool(
        left_address[0] and left_address[1] and left_address[:2] == right_address[:2]
    )
    result = {
        "distance_m": round(meters, 1),
        "name_similarity": round(similarity, 4),
        "distinctive_name_overlap": distinctive_overlap,
        "domain_equal": bool(domain(left["fields"].get("website")) and domain(left["fields"].get("website")) == domain(right["fields"].get("website"))),
        "phone_equal": bool(phone(left["fields"].get("phone")) and phone(left["fields"].get("phone")) == phone(right["fields"].get("phone"))),
        "address_equal": address_equal,
    }
    result["eligible"] = meters <= MAX_LINK_DISTANCE_M and (
        (result["domain_equal"] and (similarity >= 0.35 or distinctive_overlap))
        or (result["phone_equal"] and (similarity >= 0.55 or distinctive_overlap))
        or (address_equal and (similarity >= 0.60 or distinctive_overlap))
    ) and (meters <= 50 or address_equal)
    result["score"] = round(
        5 * result["domain_equal"] + 5 * result["phone_equal"] + 3 * address_equal
        + 2 * similarity + (1 if distinctive_overlap else 0) - min(meters, 150) / 300,
        4,
    )
    return result


def enriched_match(left: dict, overture: list[dict]) -> tuple[str, dict | None, dict | None]:
    candidates = []
    for right in overture:
        if distance_m(left, right) > MAX_LINK_DISTANCE_M:
            continue
        features = link_features(left, right)
        if features["eligible"]:
            candidates.append((features["score"], right["source_record_id"], right, features))
    candidates.sort(key=lambda row: (-row[0], row[1]))
    if not candidates:
        return "unresolved", None, None
    if len(candidates) > 1 and candidates[0][0] - candidates[1][0] < 1.0:
        return "quarantine_ambiguous", None, candidates[0][3]
    return "match", candidates[0][2], candidates[0][3]


def website_disposition(row: dict) -> str:
    if not row.get("reachable"):
        return "quarantine"
    name_tokens = set(normalized_name(row.get("name")).split()) - GENERIC_NAME_TOKENS
    title = normalized_name(row.get("title"))
    body = normalized_name((row.get("title") or "") + " " + (row.get("body_text_sample") or ""))
    overlap = len(name_tokens & set(body.split())) / len(name_tokens) if name_tokens else 0
    restaurant_evidence = bool(re.search(r"\b(restaurant|reservations|dining)\b", body))
    if overlap >= 0.75 and restaurant_evidence:
        return "accept"
    if re.search(r"\b(website disabled|domain for sale|site not found)\b", body):
        return "reject"
    if title and name_tokens and not (name_tokens & set(title.split())):
        return "reject"
    return "quarantine"


def status_disposition(row: dict) -> str:
    """Return an action gate; reachability by itself never changes state."""
    association = website_disposition(row)
    body = normalized_name((row.get("title") or "") + " " + (row.get("body_text_sample") or ""))
    explicit_closure = bool(re.search(
        r"\b(permanently closed|closed our doors|we have closed|no longer in business)\b", body
    ))
    if row.get("operating_status") == "open" and association == "accept" and explicit_closure:
        return "auto_close"
    if (row.get("operating_status") == "open" and association == "reject") or (
        row.get("operating_status") == "permanently_closed" and association == "accept"
    ):
        return "review"
    return "no_change"


def duplicate_resolution(records: list[dict]) -> dict:
    candidates = duplicate_candidates(records)
    parents = list(range(len(records)))
    def find(i):
        while parents[i] != i:
            parents[i] = parents[parents[i]]; i = parents[i]
        return i
    def union(a, b):
        a, b = find(a), find(b)
        if a != b: parents[b] = a
    names = {}
    for i, row in enumerate(records):
        name = normalized_name(row["fields"].get("name"))
        if name:
            names.setdefault(name, []).append(i)
    for indexes in names.values():
        for pos, left in enumerate(indexes):
            for right in indexes[pos + 1:]:
                if distance_m(records[left], records[right]) <= 30: union(left, right)
    groups = {}
    for i in range(len(records)): groups.setdefault(find(i), []).append(records[i])
    resolved = 0
    for group in (g for g in groups.values() if len(g) > 1):
        identifiers = []
        for row in group:
            identifiers.append((domain(row["fields"].get("website")), phone(row["fields"].get("phone"))))
        shared_domain = any(a[0] and a[0] == b[0] for i, a in enumerate(identifiers) for b in identifiers[i + 1:])
        shared_phone = any(a[1] and a[1] == b[1] for i, a in enumerate(identifiers) for b in identifiers[i + 1:])
        if shared_domain or shared_phone: resolved += 1
    return candidates | {"resolved_clusters": resolved, "ambiguous_clusters": candidates["candidate_clusters"] - resolved}


def build_metrics(raw_dir: Path, fixture_path: Path) -> dict:
    fixture = json.loads(fixture_path.read_text())
    labels = fixture["omission_candidates"]
    cached = load_web_cache(raw_dir / "cycle1-web")
    selected_by_key = {row["cache_key"]: row for row in cached.values() if row["cache_key"] in labels}
    by_area = {}
    outcomes = {}
    unresolved_by_area = {}
    for area in AREAS:
        overture = list(overture_records(raw_dir / f"overture-{area}.geojsonseq"))
        osm = list(osm_records(raw_dir / f"osm-{area}.json"))
        _, unresolved = match_records(osm, overture)
        unresolved_by_area[area] = unresolved
        by_area[area] = (overture, {row["source_record_id"]: row for row in unresolved})
    false_links = recovered = retained = 0
    for key, expected in labels.items():
        cache_row = selected_by_key[key]
        overture, unresolved = by_area[cache_row["area"]]
        disposition, right, features = enriched_match(unresolved[cache_row["source_record_id"]], overture)
        actual_hash = digest(right["source_record_id"]) if right else None
        correct = (disposition == "match" and actual_hash == expected.get("expected_overture_hash")) if expected["review_label"] == "matcher_false_negative" else disposition != "match"
        if expected["review_label"] == "matcher_false_negative":
            recovered += correct
            false_links += disposition == "match" and not correct
        else:
            retained += disposition != "match"
            false_links += disposition == "match"
        outcomes[key] = {"disposition": disposition, "correct": bool(correct), "features": features}
    all_link_outcomes = Counter()
    for area, unresolved in unresolved_by_area.items():
        all_link_outcomes.update(enriched_match(left, by_area[area][0])[0] for left in unresolved)

    website_targets = choose_overture_targets(raw_dir)
    website_rows = [cached[cycle1_digest(t["kind"] + "|" + t["area"] + "|" + t["source_record_id"])] for t in website_targets]
    website_counts = Counter(website_disposition(row) for row in website_rows)
    status_counts = Counter(status_disposition(row) for row in website_rows)
    reviewed = json.loads((Path(__file__).parent / "cycle1_review_fixture.json").read_text())
    contradicted = set(reviewed["identity_contradicted"])
    false_accepts = sum(website_disposition(cached[key]) == "accept" for key in contradicted)

    cycle1_records = []
    for area in SAMPLES:
        cycle1_records.extend(overture_records(raw_dir / f"cycle1-overture-{area}.geojsonseq"))
    duplicates = duplicate_resolution(cycle1_records)
    status_review = len(reviewed["open_status_contradicted"]) + len(reviewed["closed_status_corroborated"])
    return {
        "sample_limits": "selected Cycle 0/1 fixtures and purposive boxes; no national rate",
        "identity_linkage": {
            "cycle0_unresolved_denominator": sum(map(len, unresolved_by_area.values())),
            "all_unresolved_dispositions": dict(all_link_outcomes),
            "reviewed_false_negative_denominator": 7,
            "reviewed_false_negatives_recovered": recovered,
            "reviewed_omission_denominator": 4,
            "reviewed_high_confidence_omissions_retained": retained,
            "reviewed_false_links": false_links,
        },
        "website_associations": {
            "selected_denominator": len(website_rows), **dict(website_counts),
            "reviewed_contradiction_denominator": len(contradicted),
            "reviewed_contradictions_false_accepted": false_accepts,
        },
        "duplicate_candidates": {"denominator": len(cycle1_records), **duplicates},
        "operating_status": {
            "selected_denominator": len(website_rows),
            "automatic_state_changes": status_counts["auto_close"],
            "deterministic_review_triggers": status_counts["review"],
            "review_triggers_from_human_evidence": status_review,
            "rule": "HTTP success is never status proof; only explicit closure text on an accepted identity may auto-close",
        },
        "collection": {"new_network_pages": 0, "cached_web_pages": len(cached)},
        "reviewed_outcomes": outcomes,
    }


def main() -> None:
    root = Path(__file__).parent
    parser = argparse.ArgumentParser()
    parser.add_argument("--raw-dir", type=Path, default=root / "raw")
    parser.add_argument("--fixture", type=Path, default=root / "cycle2_review_fixture.json")
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    rendered = json.dumps(build_metrics(args.raw_dir, args.fixture), indent=2, sort_keys=True) + "\n"
    if args.output: args.output.write_text(rendered)
    else: print(rendered, end="")


if __name__ == "__main__":
    main()
