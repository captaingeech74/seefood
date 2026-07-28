# DL-002 Independent Temecula Candidate Frame

## Decision

Keep the Riverside County DES Food Facility Permits layer as the independent
Temecula candidate/status frame. It is not a restaurant-only census, a menu
source, or permission to redistribute county records.

## Official Source

- ArcGIS item:
  `https://countyofriverside.maps.arcgis.com/home/item.html?id=1af15c9bdf51452b89f67430d4e1c82d`
- Feature layer:
  `https://services1.arcgis.com/pWmBUdSlVpXStHU6/arcgis/rest/services/Food/FeatureServer/0`
- Owner: `DEHKiosk@rivco.org`
- Access: public
- Capabilities: `Query,Extract`
- Maximum records per response: 2,000
- Source item modified: `2026-07-22T22:29:48Z`
- Snapshot date: `2026-07-27`
- Published license field: blank
- Published terms-of-use field: null/absent

The missing published license does not prevent a bounded internal benchmark,
but it blocks any assumption that SeeFood may republish or commercially reuse
the source records.

## Bounded Query

The lab queried only active permit records intersecting the Temecula polygon's
bounding envelope, returned 979 point records, and then performed a local
point-in-polygon test against the locked Census polygon.

Query controls:

- `Status IN ('Active','Active Billing Exempt')`
- envelope:
  `-117.206525,33.432154,-117.054739,33.554423`
- `geometryType=esriGeometryEnvelope`
- `inSR=4326`, `outSR=4326`
- `spatialRel=esriSpatialRelIntersects`
- explicit non-person fields only
- `orderByFields=OBJECTID ASC`
- `resultRecordCount=2000`
- `f=geojson`

## Reproducible Result

The exact bounded requests are registered in
`data-lab/scripts/fetch-dl002-public-frames.mjs`. The deterministic local
builder is `data-lab/scripts/build-dl002-temecula-frame.mjs`.

| Measure | Count |
|---|---:|
| Bounding-envelope active permit rows | 979 |
| Inside incorporated-place polygon | 822 |
| Unique inside-polygon establishment IDs | 808 |
| Withheld home-based permit rows | 75 |
| Shareable internal-reconciliation permit rows | 747 |
| Shareable unique establishment IDs | 733 |

The 822 rows include 733 permanent-facility permits, 11 mobile-facility
permits, 3 temporary-facility permits, and 75 home-based permits.

Raw and generated records remain ignored. Hashes:

| File | SHA-256 |
|---|---|
| ArcGIS item metadata | `7c80dd0dc0762fbd1fd895c1d6f8128946ba66dcea1a13ccb1594125cfd79cb5` |
| ArcGIS layer metadata | `1695f9b78dcd0bb58d3aca6375a60c9a09d01873b349e1a46d2801cc761edfc9` |
| Bounding-envelope GeoJSON | `db040f3704c86c94f0f3b464c48243720d93a9d368450018e560ec8fd963b4d8` |
| Generated internal frame | `c32a6f60fe57029251e907decedbcb8dcbd088c716f8e19041cc180acfc7c21d` |

## Mandatory Reconciliation

A permit is not automatically one customer-facing restaurant. Multiple permits
may attach to one establishment. The layer also contains markets, schools,
hotels, nonprofits, caterers, temporary facilities, mobile bases,
commissaries, and other non-restaurant operations.

Before the Temecula cohort freezes:

- deduplicate by establishment and real service location;
- classify public restaurant eligibility;
- withhold all home-based records from shared artifacts;
- manually review mobile, temporary, non-storefront, school, hotel, nonprofit,
  prepackaged, commissary, and ambiguous records;
- reconcile against SeeFood/Google, OSM, and Overture;
- keep unmatched county candidates rather than deleting them for lack of a
  provider identity; and
- report counts as candidate identities until review proves a restaurant
  location.

The layer exposes only active statuses, so closure sentinels must come from a
separate versioned source.

## Independent Evaluation

An Adversarial Verifier implemented a separate winding-number geographic test
and reproduced exactly 822 inside-polygon rows and 747 non-home-based rows. It
found no point close enough to the boundary to create an ambiguous inclusion.
It confirmed the frame is useful only as a candidate/status input and agreed
that reuse remains quarantined.

The ignored raw response retains 93 home-based rows from the bounding envelope.
It must never enter the main-thread handoff or any committed/shared artifact.
