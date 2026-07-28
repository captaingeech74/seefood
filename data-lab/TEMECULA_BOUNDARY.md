# DL-002 Temecula Boundary Lock

## Decision

The development boundary is the incorporated City of Temecula, not a radius.
The boundary identity is locked; the restaurant cohort is not.

## Official Source

- Publisher: United States Census Bureau
- Vintage: January 1, 2025
- State FIPS: `06`
- Place FIPS: `78120`
- GEOID: `0678120`
- Name: `Temecula city`
- Functional status: `A`
- TIGER/Line archive:
  `https://www2.census.gov/geo/tiger/TIGER2025/PLACE/tl_2025_06_place.zip`
- TIGERweb feature query:
  `https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/Places_CouSub_ConCity_SubMCD/MapServer/11/query?where=GEOID%3D%270678120%27&outFields=*&returnGeometry=true&f=geojson&outSR=4326`
- Snapshot date: `2026-07-27`

## Local Raw Evidence

The bounded source files are ignored under
`data-lab/raw/baseline/DL-002/tiger-2025/`.

| File | SHA-256 |
|---|---|
| `tl_2025_06_place.zip` | `2b59dc5d54c69c7a451795401fc2a1c1c68b172f1d912d3486080e04a83e23e8` |
| `temecula-0678120.geojson` | `da21b5a4ff55132f4491332b080fed57cafb074475690c95363e57dbef875c9e` |

The GeoJSON response contained exactly one Polygon feature with matching state,
place, GEOID, name, and active functional status.

## Use

A candidate is geographically eligible only when its service-point coordinate
is inside or on this polygon. Coordinates alone do not establish that it is an
active customer-facing restaurant. Ambiguous boundary points require manual
review.

This lock does not make the provider union a census. The independent local
identity/status frame and reconciliation review are still required.
