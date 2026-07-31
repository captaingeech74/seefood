# Cycle 0 — Backbone Strategy

## Decision

**Implement now:** use Overture Places as the broad-open monthly seed for a
SeeFood-owned identity graph. Preserve every supplier ID and observation in the
source-neutral shadow schema. Do not buy or negotiate a commercial seed yet.
Keep OSM as a later, review-gated omission/field signal rather than a second
backbone until national matching and freshness audits show that its candidate
lift is real.

## Real sample and denominators

This was a **deliberately selected operating sample, not a national probability
sample**: 0.05° × 0.05° boxes in Ames, IA (midsize) and Temecula, CA (smaller
western market), plus a 0.03° × 0.04° Manhattan, NY box (dense/large). Overture release
`2026-06-17.0` returned 73,598 total places; 5,732 had `restaurant` in the
taxonomy hierarchy. The same boxes returned 1,371 OSM `amenity=restaurant`
records (1,362 named). All percentages below use those real denominators.

The stopped global Parquet scan was replaced with Overture's supported Python
client using STAC plus bounding boxes. The provider says bbox requests transfer
only intersecting data. Each network operation had a 90-second client timeout
and a hard 120-second process cap; every operation completed below the cap.
[Overture bbox client](https://docs.overturemaps.org/getting-data/overturemaps-py/)

| Operating model | Records/entities | Address | Website | Phone | Status |
|---|---:|---:|---:|---:|---:|
| Broad-open: Overture | 5,732 | 100.0% | 93.0% | 94.4% | 78.2% |
| Commercial-seed proxy: Foursquare lineage | 2,204 | 100.0% | 99.2% | 96.3% | 80.9% |
| Minimal combination: Overture + unresolved OSM upper bound | ≤6,351 | — | +9 on accepted overlaps | +6 on accepted overlaps | +0 |

The commercial row is deliberately an **upper bound**, not a standalone
Foursquare product benchmark: it selects Overture entities carrying a
Foursquare root source ID, but Overture may have merged fields from other
sources. It covers only 2,204/5,732 (38.5%) of the broad-open sample. Direct FSQ
OS access now requires a Places Portal account/token; commercial flat files can
be delivered daily, weekly, or monthly and require a commercial relationship.
[FSQ OS access](https://docs.foursquare.com/data-products/docs/access-fsq-os-places)
[FSQ flat file](https://docs.foursquare.com/data-products/docs/places-flat-file-overview)

## Overlap, incrementality, and errors

Conservative one-to-one linking (normalized exact name within 100 m, or name
similarity at least 0.92 within 50 m) matched 752/1,371 OSM records (54.9%) to
Overture: 719 exact and 33 similar-name matches. Forty-five OSM records had
multiple acceptable candidates. The 619 unresolved OSM records would be a 10.8%
candidate entity lift over Overture, not an automatic addition count.

On linked entities, OSM added only 9 websites and 6 phones missing from
Overture. The 619 unresolved candidates carried 432 usable addresses, 363
websites, 338 phones, and no independently measured operating status. On
accepted overlaps, OSM also supplied 649 cuisine and 477 opening-hours
observations. A selected,
area-stratified audit found 0 obvious identity errors in 30 accepted matches.
A separate deterministic selected audit of 30 unresolved OSM records found 9
apparent name-variant false negatives, confirming that the 619 candidates require better
matching/review and cannot support a national lift claim.

Observed failure modes: generic names and dense-neighborhood ambiguity;
punctuation/diacritic and shortened-name misses; stale or changed restaurant
names; OSM's weak status signal; selected-area bias; and the Foursquare proxy's
merged-field upper bound. Neither sample measures national restaurant recall or
current-place precision.

## Refresh, cost, and readiness

Overture publishes monthly data, changelogs, stable GERS IDs, and supplier
lineage; public releases are retained for only two months, so a production
loader must ingest or snapshot each release promptly. The Places sources have
per-source open licenses/attribution requirements, including Apache 2.0 for
Foursquare-derived data. There is no dataset license fee; infrastructure cost
is storage, transfer, and monthly processing. This sample transferred about
124 MB of raw Overture GeoJSON plus small OSM responses.
[Overture releases](https://docs.overturemaps.org/release-calendar/)
[Overture licensing](https://docs.overturemaps.org/attribution/)

Public Overpass is appropriate for this bounded lab, not a production national
dependency. OSM offers planet/extract data and minutely replication diffs; a
production OSM complement would need owned or contracted ingestion capacity.
[OSM service guidance](https://operations.osmfoundation.org/policies/api/)

- **Technical value:** Overture high as the seed; OSM medium as a review signal;
  Foursquare commercial seed unproven and redundant in this sample.
- **Production readiness:** schema/loader ready for shadow use; Overture needs a
  national precision/freshness audit before publishing; OSM additions are not
  ready for automatic publication.
- **Next test:** Cycle 1 national reality check—stratify Overture across regions,
  community sizes, chains, and independents; audit identity errors, closures,
  website validity, and missing restaurants. This is the evidence needed before
  turning on a production feed or reopening a commercial-seed negotiation.

No agreement is justified now. If Cycle 1 exposes a material gap, ask
Foursquare for a bounded US restaurant sample with FSQ IDs, address/coordinates,
website, phone, closure status, and monthly deltas, plus explicit production
derivative/redistribution rights; negotiate only after standalone overlap proves
incremental value.

Reproducible aggregates are in `CYCLE0_METRICS.json`; the 60-row reusable matcher
fixture contains hashes, distances, scores, and field-presence flags only. No production credentials,
writes, paid calls, or deploys were used.
