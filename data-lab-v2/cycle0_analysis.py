#!/usr/bin/env python3
"""Analyze the selected Cycle 0 boxes and emit only sanitized aggregates/fixtures."""

from __future__ import annotations

import argparse
import difflib
import hashlib
import json
import math
import unicodedata
import uuid
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

from shadow_loader import connect, load_jsonl

AREAS = ("ames_ia", "manhattan_ny", "temecula_ca")
OVERTURE_RELEASE = "2026-06-17.0"
OSM_SNAPSHOT = "2026-07-31"
FIELDS = ("address", "website", "phone", "operating_status")
ENTITY_NAMESPACE = uuid.UUID("4e6e68fb-6dc3-4cc8-873d-c63f2070e862")


def normalized_name(value: str | None) -> str:
    value = unicodedata.normalize("NFKD", (value or "").casefold())
    value = "".join(character for character in value if not unicodedata.combining(character))
    return " ".join("".join(c if c.isalnum() else " " for c in value).split())


def overture_records(path: Path):
    with path.open() as source:
        for line in source:
            feature = json.loads(line)
            props = feature["properties"]
            hierarchy = (props.get("taxonomy") or {}).get("hierarchy") or []
            if "restaurant" not in hierarchy:
                continue
            lon, lat = feature["geometry"]["coordinates"][:2]
            yield {
                "source_name": "overture", "source_record_id": props["id"],
                "latitude": lat, "longitude": lon,
                "raw_category": (props.get("taxonomy") or {}).get("primary"),
                "confidence": props.get("confidence"),
                "version": props.get("version"),
                "fields": {
                    "name": (props.get("names") or {}).get("primary"),
                    "address": (props.get("addresses") or [None])[0],
                    "website": props.get("websites"), "phone": props.get("phones"),
                    "operating_status": props.get("operating_status"),
                    "source_lineage": props.get("sources"),
                },
            }


def osm_records(path: Path):
    for element in json.loads(path.read_text()).get("elements", []):
        tags, center = element.get("tags") or {}, element.get("center") or {}
        lat, lon = element.get("lat", center.get("lat")), element.get("lon", center.get("lon"))
        if lat is None or lon is None or tags.get("amenity") != "restaurant":
            continue
        address = {key[5:]: value for key, value in tags.items() if key.startswith("addr:")}
        useful_address = bool(tags.get("addr:full") or (
            tags.get("addr:housenumber") and tags.get("addr:street")
        ))
        yield {
            "source_name": "openstreetmap", "source_record_id": f"{element['type']}/{element['id']}",
            "latitude": lat, "longitude": lon, "raw_category": "restaurant",
            "confidence": None, "version": element.get("version"),
            "fields": {
                "name": tags.get("name"), "address": address if useful_address else None,
                "address_partial": address or None,
                "website": tags.get("website") or tags.get("contact:website"),
                "phone": tags.get("phone") or tags.get("contact:phone"),
                "opening_hours": tags.get("opening_hours"), "cuisine": tags.get("cuisine"),
            },
        }


def distance_m(left: dict, right: dict) -> float:
    lat1, lon1, lat2, lon2 = map(
        math.radians,
        (left["latitude"], left["longitude"], right["latitude"], right["longitude"]),
    )
    value = math.sin((lat2 - lat1) / 2) ** 2
    value += math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    return 12_742_000 * math.asin(math.sqrt(value))


def present(value) -> bool:
    return value not in (None, "", [], {})


def lineage(record: dict, dataset: str) -> bool:
    return any(item.get("dataset") == dataset for item in record["fields"].get("source_lineage") or [])


def candidate_matches(osm: list[dict], overture: list[dict]) -> list[tuple]:
    candidates = []
    for oi, left in enumerate(osm):
        left_name = normalized_name(left["fields"].get("name"))
        if not left_name:
            continue
        for vi, right in enumerate(overture):
            meters = distance_m(left, right)
            if meters > 100:
                continue
            right_name = normalized_name(right["fields"].get("name"))
            if not right_name:
                continue
            similarity = difflib.SequenceMatcher(None, left_name, right_name).ratio()
            method = None
            if left_name == right_name:
                method = "exact_name_within_100m"
            elif meters <= 50 and similarity >= 0.92:
                method = "name_similarity_0.92_within_50m"
            if method:
                candidates.append((-similarity, meters, oi, vi, method))
    return candidates


def match_records(osm: list[dict], overture: list[dict]) -> tuple[list[dict], list[dict]]:
    candidates = candidate_matches(osm, overture)
    used_osm, used_overture, matches = set(), set(), []
    for negative_similarity, meters, oi, vi, method in sorted(candidates):
        if oi in used_osm or vi in used_overture:
            continue
        used_osm.add(oi)
        used_overture.add(vi)
        matches.append({
            "osm": osm[oi], "overture": overture[vi], "method": method,
            "distance_m": round(meters, 1), "similarity": round(-negative_similarity, 4),
        })
    unmatched = [record for index, record in enumerate(osm) if index not in used_osm]
    return matches, unmatched


def field_counts(records: list[dict]) -> dict[str, int]:
    return {field: sum(present(record["fields"].get(field)) for record in records) for field in FIELDS}


def entity_id(source_name: str, source_record_id: str) -> str:
    return str(uuid.uuid5(ENTITY_NAMESPACE, f"{source_name}|{source_record_id}"))


def shadow_rows(records: list[dict], entity_ids: dict[tuple[str, str], str], observed_at: str):
    for record in records:
        yield {
            "source_name": record["source_name"],
            "source_record_id": record["source_record_id"],
            "entity_id": entity_ids[(record["source_name"], record["source_record_id"])],
            "observed_at": observed_at,
            "source_record_version": record.get("version"),
            "location": {"latitude": record["latitude"], "longitude": record["longitude"]},
            "observations": {
                key: value for key, value in record["fields"].items() if present(value)
            } | {"raw_category": record.get("raw_category")},
            "confidence": record.get("confidence"),
        }


def digest(value: str) -> str:
    return hashlib.sha256(("seefood-cycle0|" + value).encode()).hexdigest()[:16]


def sanitized_rows(area: str, matches: list[dict], unmatched: list[dict]) -> list[dict]:
    fuzzy = sorted(
        (row for row in matches if row["method"].startswith("name_similarity")),
        key=lambda row: (row["distance_m"], row["osm"]["source_record_id"]),
    )[:3]
    exact = sorted(
        (row for row in matches if row["method"].startswith("exact")),
        key=lambda row: (row["distance_m"], row["osm"]["source_record_id"]),
    )[: 10 - len(fuzzy)]
    chosen = fuzzy + exact
    rows = []
    for row in chosen:
        rows.append({
            "expected": "match",
            "selected_area": area,
            "left_id_hash": digest(row["osm"]["source_record_id"]),
            "right_id_hash": digest(row["overture"]["source_record_id"]),
            "name_fingerprint_equal": normalized_name(row["osm"]["fields"].get("name"))
                == normalized_name(row["overture"]["fields"].get("name")),
            "distance_m": row["distance_m"],
            "similarity": row["similarity"],
            "method": row["method"],
        })
    for record in sorted(unmatched, key=lambda row: digest(row["source_record_id"]))[:10]:
        rows.append({
            "expected": "unresolved",
            "selected_area": area,
            "left_id_hash": digest(record["source_record_id"]),
            "has_name": present(record["fields"].get("name")),
            "field_presence": {key: present(record["fields"].get(key)) for key in FIELDS},
        })
    return rows


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--raw", type=Path, default=Path(__file__).with_name("raw"))
    root = Path(__file__).parent
    parser.add_argument("--shadow", type=Path, default=root / "shadow/cycle0.sqlite")
    parser.add_argument("--output", type=Path, default=root / "CYCLE0_METRICS.json")
    parser.add_argument("--fixture", type=Path, default=root / "fixtures/cycle0_benchmark.json")
    parser.add_argument("--audit-raw", action="store_true")
    args = parser.parse_args()
    if args.shadow.exists():
        args.shadow.unlink()
    connection = connect(args.shadow, Path(__file__).with_name("shadow_schema.sql"))
    metrics = {"sample_kind": "selected bounding boxes", "areas": {}, "models": {}}
    all_overture, all_osm, all_matches, all_unmatched = [], [], [], []
    ambiguous_records = 0
    benchmark_rows = []
    all_place_denominator = 0
    for area in AREAS:
        overture_path = args.raw / f"overture-{area}.geojsonseq"
        osm_path = args.raw / f"osm-{area}.json"
        all_place_denominator += sum(1 for _ in overture_path.open())
        overture = list(overture_records(overture_path))
        osm = list(osm_records(osm_path))
        matches, unmatched = match_records(osm, overture)
        candidate_counts = Counter(row[2] for row in candidate_matches(osm, overture))
        area_ambiguous = sum(count > 1 for count in candidate_counts.values())
        ambiguous_records += area_ambiguous
        benchmark_rows.extend(sanitized_rows(area, matches, unmatched))
        fsq = [record for record in overture if lineage(record, "Foursquare")]
        metrics["areas"][area] = {
            "overture_restaurants": len(overture), "fsq_lineage_proxy": len(fsq),
            "osm_restaurants": len(osm), "accepted_overlap": len(matches),
            "osm_unresolved_increment": len(unmatched),
            "ambiguous_osm_records": area_ambiguous,
            "match_methods": dict(Counter(row["method"] for row in matches)),
        }
        all_overture.extend(overture); all_osm.extend(osm); all_matches.extend(matches); all_unmatched.extend(unmatched)
    entity_ids = {
        (record["source_name"], record["source_record_id"]):
            entity_id(record["source_name"], record["source_record_id"])
        for record in all_overture + all_osm
    }
    for match in all_matches:
        entity_ids[("openstreetmap", match["osm"]["source_record_id"])] = entity_ids[
            ("overture", match["overture"]["source_record_id"])
        ]
    observed_at = datetime.now(timezone.utc).isoformat()
    load_jsonl(connection, shadow_rows(all_overture, entity_ids, observed_at),
               source_name="overture", source_release=OVERTURE_RELEASE,
               selected_sample="three selected Cycle 0 bounding boxes")
    load_jsonl(connection, shadow_rows(all_osm, entity_ids, observed_at),
               source_name="openstreetmap", source_release=OSM_SNAPSHOT,
               selected_sample="three selected Cycle 0 bounding boxes")
    with connection:
        for match in all_matches:
            connection.execute(
                """INSERT INTO identity_decisions
                   (left_source,left_record_id,right_source,right_record_id,decision,method,
                    score,distance_meters,decided_at) VALUES(?,?,'overture',?,'match',?,?,?,?)""",
                ("openstreetmap", match["osm"]["source_record_id"],
                 match["overture"]["source_record_id"], match["method"],
                 match["similarity"], match["distance_m"], observed_at),
            )
    fsq = [record for record in all_overture if lineage(record, "Foursquare")]
    increments = Counter()
    for row in all_matches:
        for field in (*FIELDS, "opening_hours", "cuisine"):
            if present(row["osm"]["fields"].get(field)) and not present(row["overture"]["fields"].get(field)):
                increments[field] += 1
    candidate_fields = field_counts(all_unmatched)
    combined_fields = field_counts(all_overture)
    for field in FIELDS:
        combined_fields[field] += increments[field] + candidate_fields[field]
    metrics.update({
        "raw_acquisition_denominator": {
            "overture_all_places": all_place_denominator,
            "overture_restaurants": len(all_overture), "osm_restaurants": len(all_osm),
        },
        "models": {
            "broad_open_overture": {"records": len(all_overture), "fields": field_counts(all_overture)},
            "commercial_fsq_lineage_upper_bound": {"records": len(fsq), "fields": field_counts(fsq)},
            "minimal_overture_plus_osm": {
                "osm_fields": field_counts(all_osm),
                "records_upper_bound": len(all_overture) + len(all_unmatched),
                "accepted_overlap": len(all_matches), "osm_unresolved_increment": len(all_unmatched),
                "ambiguous_osm_records": ambiguous_records,
                "matched_record_incremental_fields_from_osm": dict(increments),
                "unresolved_candidate_fields": candidate_fields,
                "combined_field_upper_bound": combined_fields,
            },
        },
        "shadow": {
            "source_records": connection.execute("SELECT count(*) FROM source_records").fetchone()[0],
            "entities": connection.execute("SELECT count(*) FROM entities").fetchone()[0],
            "accepted_cross_source_links": len(all_matches),
            "foreign_key_errors": len(connection.execute("PRAGMA foreign_key_check").fetchall()),
        },
    })
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(metrics, indent=2, sort_keys=True) + "\n")
    args.fixture.parent.mkdir(parents=True, exist_ok=True)
    args.fixture.write_text(json.dumps({
        "description": "Sanitized selected Cycle 0 matcher benchmark; hashes are not provider IDs.",
        "sample_kind": "selected; 10 accepted and 10 unresolved per area",
        "rows": benchmark_rows,
    }, indent=2, sort_keys=True) + "\n")
    if args.audit_raw:
        for row in all_matches[:40]:
            print("MATCH", row["method"], row["distance_m"],
                  row["osm"]["fields"].get("name"), "|", row["overture"]["fields"].get("name"))
    print(json.dumps(metrics, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
