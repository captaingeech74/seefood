#!/usr/bin/env python3
"""Build bounded OSM, Overture, and Census-backed DL-002 Stage 1 frames."""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
import shutil
import urllib.parse
import urllib.request
import zipfile
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

import duckdb


OVERTURE_RELEASE = "2026-06-17.0"
OVERTURE_PARQUET = (
    "s3://overturemaps-us-west-2/release/"
    f"{OVERTURE_RELEASE}/theme=places/type=place/*"
)
CBSA_URL = (
    "https://www2.census.gov/geo/tiger/GENZ2025/shp/"
    "cb_2025_us_cbsa_500k.zip"
)
CBSA_POPULATION_URL = (
    "https://www2.census.gov/programs-surveys/popest/datasets/"
    "2020-2024/metro/totals/cbsa-est2024-alldata.csv"
)
OVERPASS_URL = "https://overpass-api.de/api/interpreter"
USER_AGENT = "SeeFood-DL002-Stage1/1.0 bounded-read-only-export"

DIVISIONS = {
    "CT": "New England",
    "ME": "New England",
    "MA": "New England",
    "NH": "New England",
    "RI": "New England",
    "VT": "New England",
    "NJ": "Middle Atlantic",
    "NY": "Middle Atlantic",
    "PA": "Middle Atlantic",
    "IN": "East North Central",
    "IL": "East North Central",
    "MI": "East North Central",
    "OH": "East North Central",
    "WI": "East North Central",
    "IA": "West North Central",
    "KS": "West North Central",
    "MN": "West North Central",
    "MO": "West North Central",
    "NE": "West North Central",
    "ND": "West North Central",
    "SD": "West North Central",
    "DE": "South Atlantic",
    "DC": "South Atlantic",
    "FL": "South Atlantic",
    "GA": "South Atlantic",
    "MD": "South Atlantic",
    "NC": "South Atlantic",
    "SC": "South Atlantic",
    "VA": "South Atlantic",
    "WV": "South Atlantic",
    "AL": "East South Central",
    "KY": "East South Central",
    "MS": "East South Central",
    "TN": "East South Central",
    "AR": "West South Central",
    "LA": "West South Central",
    "OK": "West South Central",
    "TX": "West South Central",
    "AZ": "Mountain",
    "CO": "Mountain",
    "ID": "Mountain",
    "MT": "Mountain",
    "NV": "Mountain",
    "NM": "Mountain",
    "UT": "Mountain",
    "WY": "Mountain",
    "AK": "Pacific",
    "HI": "Pacific",
    "OR": "Pacific",
    "WA": "Pacific",
}

CUISINES = [
    "American/comfort",
    "Mexican/Latin American",
    "Italian/European",
    "Chinese/Taiwanese",
    "Japanese/Korean",
    "Southeast Asian",
    "South Asian",
    "Middle Eastern/Mediterranean",
    "African/Caribbean",
    "barbecue/soul/Cajun",
    "cafe/bakery/dessert",
    "vegetarian/health/specialty",
]

ORDERING_HOST_MARKERS = (
    "doordash.",
    "grubhub.",
    "ubereats.",
    "toasttab.",
    "chownow.",
    "slice.",
    "order.online",
    "clover.",
    "square.site",
)


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def download(url: str, target: Path, max_bytes: int) -> dict:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=90) as response:
        declared = int(response.headers.get("content-length") or 0)
        if declared > max_bytes:
            raise RuntimeError(f"{url} exceeds the declared byte bound")
        payload = response.read(max_bytes + 1)
        if len(payload) > max_bytes:
            raise RuntimeError(f"{url} exceeded the byte bound")
        target.write_bytes(payload)
        return {
            "source": url,
            "bytes": len(payload),
            "sha256": sha256_bytes(payload),
            "lastModified": response.headers.get("last-modified"),
        }


def json_lines(target: Path, rows) -> tuple[int, str]:
    count = 0
    digest = hashlib.sha256()
    with target.open("wb") as handle:
        for row in rows:
            encoded = (
                json.dumps(row, sort_keys=True, separators=(",", ":")) + "\n"
            ).encode()
            handle.write(encoded)
            digest.update(encoded)
            count += 1
    return count, digest.hexdigest()


def boundary_geometry(boundary: dict):
    if len(boundary.get("features", [])) != 1:
        raise RuntimeError("Expected exactly one Temecula boundary feature")
    geometry = boundary["features"][0]["geometry"]
    if geometry["type"] == "Polygon":
        return [geometry["coordinates"]]
    if geometry["type"] == "MultiPolygon":
        return geometry["coordinates"]
    raise RuntimeError(f"Unsupported boundary geometry: {geometry['type']}")


def point_in_ring(point, ring) -> bool:
    x, y = point
    inside = False
    for index, current in enumerate(ring):
        previous = ring[index - 1]
        x1, y1 = current
        x2, y2 = previous
        if (y1 > y) != (y2 > y):
            crossing = (x2 - x1) * (y - y1) / (y2 - y1) + x1
            if x < crossing:
                inside = not inside
    return inside


def contains(point, polygons) -> bool:
    for rings in polygons:
        if point_in_ring(point, rings[0]) and not any(
            point_in_ring(point, hole) for hole in rings[1:]
        ):
            return True
    return False


def website_host(value: str | None) -> str | None:
    if not value:
        return None
    try:
        return urllib.parse.urlparse(value).hostname
    except ValueError:
        return None


def cuisine_for(categories: list[str]) -> str | None:
    value = " ".join(category.lower() for category in categories if category)
    rules = [
        ("Mexican/Latin American", ("mexican", "taco", "latin", "brazilian", "argentin")),
        ("Chinese/Taiwanese", ("chinese", "taiwan")),
        ("Japanese/Korean", ("japanese", "sushi", "ramen", "korean")),
        ("Southeast Asian", ("thai", "vietnam", "filipino", "indones", "malays")),
        ("South Asian", ("indian", "pakistan", "nepal", "bangladesh", "sri_lank")),
        (
            "Middle Eastern/Mediterranean",
            ("middle_eastern", "mediterranean", "leban", "turkish", "persian", "greek"),
        ),
        ("African/Caribbean", ("african", "ethiopian", "caribbean", "jamaican")),
        ("barbecue/soul/Cajun", ("barbecue", "bbq", "soul_food", "cajun", "creole")),
        (
            "cafe/bakery/dessert",
            ("cafe", "coffee", "bakery", "dessert", "ice_cream", "donut", "tea"),
        ),
        (
            "vegetarian/health/specialty",
            ("vegetarian", "vegan", "salad", "health", "juice", "smoothie", "organic"),
        ),
        (
            "Italian/European",
            ("italian", "pizza", "french", "german", "spanish", "european"),
        ),
        (
            "American/comfort",
            (
                "american",
                "burger",
                "diner",
                "breakfast",
                "chicken",
                "sandwich",
                "steak",
                "fast_food",
            ),
        ),
    ]
    for label, markers in rules:
        if any(marker in value for marker in markers):
            return label
    return None


def web_strength(websites: list[str], socials: list[str]) -> tuple[str, str]:
    hosts = [website_host(value) for value in websites]
    hosts = [host.lower() for host in hosts if host]
    if hosts and all(
        any(marker in host for marker in ORDERING_HOST_MARKERS) for host in hosts
    ):
        return "orderingOnly", "inferred"
    if any(value.lower().split("?")[0].endswith(".pdf") for value in websites):
        return "weakPdfSocial", "inferred"
    if not hosts and socials:
        return "weakPdfSocial", "inferred"
    if not hosts and not socials:
        return "none", "inferred"
    return "structured", "inferred"


def overpass_rows(polygons, bounds, observed_at):
    south, north, west, east = bounds
    query = f"""
[out:json][timeout:120];
(
  node[amenity~"restaurant|cafe|fast_food|food_court|bar|pub"]({south},{west},{north},{east});
  way[amenity~"restaurant|cafe|fast_food|food_court|bar|pub"]({south},{west},{north},{east});
  relation[amenity~"restaurant|cafe|fast_food|food_court|bar|pub"]({south},{west},{north},{east});
  node[shop~"bakery|pastry|coffee|tea|ice_cream"]({south},{west},{north},{east});
  way[shop~"bakery|pastry|coffee|tea|ice_cream"]({south},{west},{north},{east});
);
out center tags;
""".strip()
    body = urllib.parse.urlencode({"data": query}).encode()
    request = urllib.request.Request(
        OVERPASS_URL,
        data=body,
        headers={
            "User-Agent": USER_AGENT,
            "Content-Type": "application/x-www-form-urlencoded",
        },
    )
    with urllib.request.urlopen(request, timeout=150) as response:
        payload = response.read(10_000_001)
        if len(payload) > 10_000_000:
            raise RuntimeError("Bounded OSM response exceeded 10 MB")
    document = json.loads(payload)
    rows = []
    for element in document.get("elements", []):
        tags = element.get("tags", {})
        name = tags.get("name") or tags.get("brand")
        latitude = element.get("lat", element.get("center", {}).get("lat"))
        longitude = element.get("lon", element.get("center", {}).get("lon"))
        if not name or latitude is None or longitude is None:
            continue
        if not contains((longitude, latitude), polygons):
            continue
        rows.append(
            {
                "sourceFamily": "openstreetmap",
                "stableExternalId": f"{element['type']}/{element['id']}",
                "publicName": name,
                "addressLine": " ".join(
                    value
                    for value in (
                        tags.get("addr:housenumber"),
                        tags.get("addr:street"),
                    )
                    if value
                )
                or None,
                "city": tags.get("addr:city"),
                "state": tags.get("addr:state"),
                "postalCode": tags.get("addr:postcode"),
                "latitude": latitude,
                "longitude": longitude,
                "sourceCategory": tags.get("amenity") or tags.get("shop"),
                "sourceOperatingStatus": "unknown",
                "sourceObservedAt": document.get("osm3s", {}).get(
                    "timestamp_osm_base", observed_at
                ),
                "websiteHost": website_host(
                    tags.get("website") or tags.get("contact:website")
                ),
                "brandName": tags.get("brand"),
                "sourceLicense": "ODbL-1.0",
                "sourceAttribution": "OpenStreetMap contributors",
                "sourceSpecificPublicId": f"{element['type']}/{element['id']}",
            }
        )
    return rows, {
        "requestSha256": sha256_bytes(query.encode()),
        "responseSha256": sha256_bytes(payload),
        "responseBytes": len(payload),
        "sourceObservedAt": document.get("osm3s", {}).get("timestamp_osm_base"),
    }


def register_cbsa(connection, shapefile: Path, population_csv: Path):
    population_rows = []
    with population_csv.open(encoding="cp1252", newline="") as handle:
        for row in csv.DictReader(handle):
            if row["STCOU"]:
                continue
            population_rows.append(
                (
                    row["CBSA"],
                    row["LSAD"],
                    int(row["POPESTIMATE2024"]),
                )
            )
    metro = sorted(
        (
            (code, population)
            for code, area_type, population in population_rows
            if area_type == "Metropolitan Statistical Area"
        ),
        key=lambda row: (-row[1], row[0]),
    )
    ranks = {code: rank for rank, (code, _) in enumerate(metro, 1)}
    connection.execute(
        "create temp table cbsa_population(code varchar, area_type varchar, "
        "population bigint, metro_rank integer)"
    )
    connection.executemany(
        "insert into cbsa_population values (?, ?, ?, ?)",
        [
            (code, area_type, population, ranks.get(code))
            for code, area_type, population in population_rows
        ],
    )
    connection.execute(
        f"""
create temp table cbsa as
select
  shape.CBSAFP as code,
  shape.NAME as name,
  shape.LSAD as lsad,
  population.area_type,
  population.population,
  population.metro_rank,
  shape.geom
from st_read('{shapefile.as_posix()}') shape
left join cbsa_population population on population.code = shape.CBSAFP
"""
    )


def division_case() -> str:
    cases = " ".join(
        f"when '{state}' then '{division}'" for state, division in DIVISIONS.items()
    )
    return f"case state {cases} else null end"


def build_overture(connection, output: Path, polygons, bounds, observed_at):
    south, north, west, east = bounds
    query = f"""
select
  id,
  names.primary as public_name,
  bbox.ymin as latitude,
  bbox.xmin as longitude,
  operating_status,
  categories.primary as primary_category,
  categories.alternate as alternate_categories,
  taxonomy.hierarchy as hierarchy,
  websites,
  brand.names.primary as brand_name,
  list_filter(addresses, address -> address.country = 'US')[1] as address
from read_parquet('{OVERTURE_PARQUET}')
where bbox.xmin between {west} and {east}
  and bbox.ymin between {south} and {north}
  and list_contains(list_transform(addresses, address -> address.country), 'US')
  and list_contains(taxonomy.hierarchy, 'restaurant')
"""
    cursor = connection.execute(query)
    columns = [description[0] for description in cursor.description]
    rows = []
    while True:
        batch = cursor.fetchmany(1000)
        if not batch:
            break
        for values in batch:
            record = dict(zip(columns, values))
            if not contains((record["longitude"], record["latitude"]), polygons):
                continue
            address = record.pop("address") or {}
            websites = record.pop("websites") or []
            rows.append(
                {
                    "sourceFamily": "overture",
                    "stableExternalId": record["id"],
                    "publicName": record["public_name"],
                    "addressLine": address.get("freeform"),
                    "city": address.get("locality"),
                    "state": address.get("region"),
                    "postalCode": address.get("postcode"),
                    "latitude": record["latitude"],
                    "longitude": record["longitude"],
                    "sourceCategory": record["primary_category"],
                    "sourceOperatingStatus": record["operating_status"],
                    "sourceObservedAt": observed_at,
                    "websiteHost": website_host(websites[0] if websites else None),
                    "brandName": record["brand_name"],
                    "sourceLicense": "CDLA-Permissive-2.0",
                    "sourceAttribution": "Overture Maps Foundation",
                    "sourceSpecificPublicId": record["id"],
                }
            )
    count, digest = json_lines(output, sorted(rows, key=lambda row: row["stableExternalId"]))
    return {"rowCount": count, "sha256": digest, "querySha256": sha256_bytes(query.encode())}


def build_national(connection, output: Path, observed_at):
    state_case = division_case()
    query = f"""
with base as (
  select
    id,
    names.primary as public_name,
    bbox.ymin as latitude,
    bbox.xmin as longitude,
    operating_status,
    categories.primary as primary_category,
    categories.alternate as alternate_categories,
    taxonomy.hierarchy as hierarchy,
    websites,
    socials,
    brand.names.primary as brand_name,
    list_filter(addresses, address -> address.country = 'US')[1] as address,
    geometry
  from read_parquet('{OVERTURE_PARQUET}')
  where list_contains(list_transform(addresses, address -> address.country), 'US')
    and (
      list_contains(taxonomy.hierarchy, 'restaurant')
      or categories.primary = 'food_truck'
      or list_contains(categories.alternate, 'food_truck')
    )
),
named as (
  select
    *,
    upper(address.region) as state,
    regexp_replace(lower(public_name), '[^a-z0-9]+', '', 'g') as normalized_name,
    count(*) over (
      partition by regexp_replace(lower(public_name), '[^a-z0-9]+', '', 'g')
    ) as normalized_name_count
  from base
  where address.region <> 'CA'
    and operating_status in ('open', 'permanently_closed')
),
geographic as (
  select
    named.*,
    cbsa.code as cbsa_code,
    cbsa.name as cbsa_name,
    cbsa.area_type as cbsa_type,
    cbsa.metro_rank,
    {state_case} as census_division
  from named
  left join cbsa on st_within(named.geometry, cbsa.geom)
)
select *
from geographic
where census_division is not null
order by sha256(id)
"""
    cursor = connection.execute(query)
    columns = [description[0] for description in cursor.description]
    counters = {
        "marketSize": Counter(),
        "businessForm": Counter(),
        "webStrength": Counter(),
        "sourceStatus": Counter(),
        "cuisine": Counter(),
        "censusDivision": Counter(),
    }
    selected_per_cell = Counter()
    digest = hashlib.sha256()
    row_count = 0
    with output.open("wb") as handle:
        while True:
            batch = cursor.fetchmany(2000)
            if not batch:
                break
            for values in batch:
                record = dict(zip(columns, values))
                if record["cbsa_type"] == "Metropolitan Statistical Area":
                    rank = record["metro_rank"]
                    if rank is None:
                        continue
                    market = (
                        "top20"
                        if rank <= 20
                        else "otherTop50"
                        if rank <= 50
                        else "msa51_387"
                    )
                elif record["cbsa_type"] == "Micropolitan Statistical Area":
                    market = "micropolitan"
                else:
                    market = "noncore"
                categories = [
                    record["primary_category"],
                    *(record["alternate_categories"] or []),
                    *(record["hierarchy"] or []),
                ]
                cuisine = cuisine_for(categories) or "unknown"
                primary = (record["primary_category"] or "").lower()
                hierarchy = " ".join(record["hierarchy"] or []).lower()
                if any("food_truck" in category.lower() for category in categories if category):
                    business_subtype = "foodTruck"
                    business_subtype_confidence = "verified"
                elif any(
                    marker in primary
                    for marker in (
                        "brewery",
                        "brewpub",
                        "winery",
                        "hotel",
                        "museum",
                        "stadium",
                        "food_court",
                    )
                ):
                    business_subtype = "nontraditional"
                    business_subtype_confidence = "inferred"
                elif record["brand_name"]:
                    business_subtype = "chain"
                    business_subtype_confidence = "verified"
                elif record["normalized_name_count"] == 1:
                    business_subtype = "singleIndependent"
                    business_subtype_confidence = "inferred"
                elif record["normalized_name_count"] <= 10:
                    business_subtype = "smallMulti"
                    business_subtype_confidence = "inferred"
                else:
                    business_subtype = "otherEligible"
                    business_subtype_confidence = "inferred"
                business = "chain" if record["brand_name"] else "independent"
                business_confidence = (
                    "verified" if record["brand_name"] else "inferred"
                )
                websites = record["websites"] or []
                socials = record["socials"] or []
                web, web_confidence = web_strength(websites, socials)
                status = (
                    "openOrderable"
                    if record["operating_status"] == "open"
                    else "closedMovedReplaced"
                )
                cell = (
                    market,
                    business,
                    status,
                    record["census_division"],
                )
                if selected_per_cell[cell] >= 12:
                    continue
                selected_per_cell[cell] += 1
                hosts = sorted(
                    {
                        host
                        for host in (website_host(value) for value in websites)
                        if host
                    }
                )
                public = {
                    "stablePublicId": record["id"],
                    "publicName": record["public_name"],
                    "latitude": record["latitude"],
                    "longitude": record["longitude"],
                    "coarseAddress": {
                        "city": record["address"].get("locality"),
                        "state": record["state"],
                        "postalCode": record["address"].get("postcode"),
                    },
                    "sourceFamily": "overture",
                    "sourceVersion": OVERTURE_RELEASE,
                    "sourceObservedAt": observed_at,
                    "eligibility": status == "openOrderable",
                    "exclusionReason": (
                        None if status == "openOrderable" else "status_sentinel"
                    ),
                    "marketSize": market,
                    "businessForm": business,
                    "businessSubtype": business_subtype,
                    "webStrength": web,
                    "sourceStatus": status,
                    "cuisineGroup": cuisine,
                    "censusDivision": record["census_division"],
                    "normalizedBrandKey": (
                        re.sub(r"[^a-z0-9]+", "", record["brand_name"].lower())
                        if record["brand_name"]
                        else None
                    ),
                    "websiteHosts": hosts,
                    "isTemecula": False,
                    "isLegacyBenchmark": False,
                    "isDevelopment": False,
                    "isTestFixture": False,
                    "duplicateGroup": sha256_bytes(
                        (
                            f"{record['normalized_name']}|"
                            f"{round(record['latitude'], 4)}|"
                            f"{round(record['longitude'], 4)}"
                        ).encode()
                    ),
                    "fieldEvidence": {
                        "marketSize": {
                            "basis": "2025 Census CBSA spatial join and 2024 population rank",
                            "confidence": "verified",
                            "cbsaCode": record["cbsa_code"],
                        },
                        "businessForm": {
                            "basis": "Overture brand evidence; missing brand plus national name evidence is treated as inferred independent",
                            "confidence": business_confidence,
                        },
                        "businessSubtype": {
                            "basis": "Optional Overture category/brand and national normalized-name context",
                            "confidence": business_subtype_confidence,
                        },
                        "webStrength": {
                            "basis": "Overture website/social locator presence and host class",
                            "confidence": web_confidence,
                        },
                        "sourceStatus": {
                            "basis": "Overture operating_status",
                            "confidence": "verified",
                        },
                        "cuisineGroup": {
                            "basis": "registered mapping of Overture category/taxonomy",
                            "confidence": "inferred",
                        },
                        "censusDivision": {
                            "basis": "public state code mapped to Census division",
                            "confidence": "verified",
                        },
                    },
                }
                encoded = (
                    json.dumps(public, sort_keys=True, separators=(",", ":")) + "\n"
                ).encode()
                handle.write(encoded)
                digest.update(encoded)
                row_count += 1
                counters["marketSize"][market] += 1
                counters["businessForm"][business] += 1
                counters["webStrength"][web] += 1
                counters["sourceStatus"][status] += 1
                counters["cuisine"][cuisine] += 1
                counters["censusDivision"][record["census_division"]] += 1
    return {
        "rowCount": row_count,
        "sha256": digest.hexdigest(),
        "querySha256": sha256_bytes(query.encode()),
        "counts": {key: dict(sorted(value.items())) for key, value in counters.items()},
        "candidateCap":
            "At most 12 records per hard market/business/status/division cell after a public SHA-256(id) order; optional website, cuisine, venue, truck, ghost, and opening-recency fields do not affect the cap. Guardian applies its own secret-seed constrained selection.",
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", required=True)
    parser.add_argument("--boundary", required=True)
    args = parser.parse_args()
    output = Path(args.output).resolve()
    boundary_path = Path(args.boundary).resolve()
    output.mkdir(parents=True, exist_ok=False)
    guardian = output / "guardian"
    snapshots = output / "source-snapshots"
    guardian.mkdir()
    snapshots.mkdir()
    observed_at = datetime.now(timezone.utc).isoformat()

    boundary_bytes = boundary_path.read_bytes()
    boundary = json.loads(boundary_bytes)
    polygons = boundary_geometry(boundary)
    points = [point for polygon in polygons for ring in polygon for point in ring]
    west = min(point[0] for point in points)
    east = max(point[0] for point in points)
    south = min(point[1] for point in points)
    north = max(point[1] for point in points)
    bounds = (south, north, west, east)

    cbsa_zip = snapshots / "cb_2025_us_cbsa_500k.zip"
    population_csv = snapshots / "cbsa-est2024-alldata.csv"
    census_sources = {
        "cbsaBoundary": download(CBSA_URL, cbsa_zip, 6_000_000),
        "cbsaPopulation": download(
            CBSA_POPULATION_URL, population_csv, 1_000_000
        ),
    }
    extracted = output / ".cbsa"
    extracted.mkdir()
    with zipfile.ZipFile(cbsa_zip) as archive:
        archive.extractall(extracted)
    shapefile = next(extracted.glob("*.shp"))

    connection = duckdb.connect()
    connection.execute("INSTALL httpfs")
    connection.execute("LOAD httpfs")
    connection.execute("INSTALL spatial")
    connection.execute("LOAD spatial")
    connection.execute("SET s3_region='us-west-2'")
    register_cbsa(connection, shapefile, population_csv)

    osm, osm_source = overpass_rows(polygons, bounds, observed_at)
    osm_count, osm_hash = json_lines(
        output / "temecula-osm.jsonl",
        sorted(osm, key=lambda row: row["stableExternalId"]),
    )
    temecula_overture = build_overture(
        connection,
        output / "temecula-overture.jsonl",
        polygons,
        bounds,
        observed_at,
    )
    national = build_national(
        connection, guardian / "national-candidates.jsonl", observed_at
    )
    connection.close()
    shutil.rmtree(extracted)

    summary = {
        "generatedAtUtc": observed_at,
        "boundary": {
            "geoid": "0678120",
            "sha256": sha256_bytes(boundary_bytes),
            "bounds": {
                "south": south,
                "north": north,
                "west": west,
                "east": east,
            },
        },
        "sources": {
            "openstreetmap": {
                **osm_source,
                "license": "ODbL-1.0",
                "attribution": "OpenStreetMap contributors",
            },
            "overture": {
                "release": OVERTURE_RELEASE,
                "license": "CDLA-Permissive-2.0",
                "attribution": "Overture Maps Foundation",
            },
            "census": census_sources,
        },
        "temecula": {
            "openstreetmap": {"rowCount": osm_count, "sha256": osm_hash},
            "overture": temecula_overture,
        },
        "national": national,
        "optionalFields": {
            "ghostKitchenClassificationRequired": False,
            "openingDateOrRecencyRequired": False,
        },
    }
    (output / "public-frame-summary.json").write_text(
        json.dumps(summary, indent=2) + "\n"
    )
    print(
        json.dumps(
            {
                "temeculaOsmRows": osm_count,
                "temeculaOvertureRows": temecula_overture["rowCount"],
                "nationalCandidateRows": national["rowCount"],
                "nationalCounts": national["counts"],
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
