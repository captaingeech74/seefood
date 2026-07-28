# DL-002 Read-Only Input Handoff

## Purpose

Supply the smallest sanitized local bundle that lets the DataLab freeze the
Temecula candidate baseline, let the Benchmark Guardian privately select the
120-location national holdout, and compute the claimed-versus-verified
baseline. This is an evidence export, not a product change.

## Absolute Restrictions

Do not give the DataLab production credentials. Do not write production data,
call mutation-capable application routes, deploy, change infrastructure,
consume paid API quota, contact a vendor, or fetch missing images.

Database work must run in a transaction whose captured transcript proves:

```sql
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SHOW transaction_read_only;
SELECT pg_current_wal_lsn();
-- bounded SELECT statements only
SELECT pg_current_wal_lsn();
ROLLBACK;
```

Both WAL values must be recorded. A changed WAL value is not by itself a
failure on a shared database, but `transaction_read_only` must be `on`, every
executed statement must be logged, and no application route may be used.

Place the finished bundle only at:

`data-lab/raw/baseline/DL-002/`

Do not edit DataLab control or experiment files.

## A. Frozen Metadata

Create `snapshot.json` containing:

- UTC start and finish timestamps;
- repository commit and schema/migration version;
- database host fingerprint, database name hash, and role name hash, but no
  hostname, connection string, credential, or role name;
- the read-only transcript and the exact SQL filenames;
- production coverage-function source and SHA-256;
- row counts and SHA-256 for every payload file;
- the source versions and observation timestamps below; and
- `piiRemoved: true`, `secretsRemoved: true`, and the completed scan result.

## B. Temecula Candidate Inputs

The boundary is already locked in `TEMECULA_BOUNDARY.md`. Export or prepare
four separate, versioned inputs whose service points fall inside that polygon:

1. `temecula-seefood.jsonl`: all existing SeeFood restaurant entities and
   attached Google identities.
2. `temecula-osm.jsonl`: one bounded OpenStreetMap snapshot.
3. `temecula-overture.jsonl`: one bounded Overture Places snapshot.
4. The DataLab already holds the ignored, bounded Riverside County DES Food
   Facility Permits snapshot documented in `TEMECULA_FRAME.md`. Do not
   duplicate it or substitute a search-results scrape.

The county layer is an independently maintained candidate/status frame, but it
contains many non-restaurant permits. Search results, individual inspection
documents, the 60-day closure/downgrade lists, and aggregate establishment
counts remain insufficient substitutes.

Every candidate row must contain only:

- `sourceFamily`;
- `stableExternalId`;
- `publicName`;
- `addressLine`, `city`, `state`, and `postalCode`;
- `latitude` and `longitude`;
- `sourceCategory`;
- `sourceOperatingStatus`;
- `sourceObservedAt`;
- `websiteHost`, never a full URL containing a path or query;
- `brandName` when publicly declared;
- `sourceLicense` and `sourceAttribution`;
- internal entity/restaurant IDs only as optional join hashes, never raw UUIDs;
  and
- source-specific public IDs needed for reconciliation.

Exclude owner names, contributor identifiers, emails, phone numbers, permit
holder details, free-text inspection narratives, and private contacts.

Cap the reconciled selectable Temecula frame at 500 restaurants. If the union
exceeds 500, keep all ambiguous, closure, truck, ghost, duplicate, and
independent-frame-only rows, then deterministically select ordinary rows by
ascending `SHA-256("DL-002-TEM-2026-07-27" || stableExternalId)`. Report the
full pre-cap counts by source and overlap.

Also create:

- `temecula-reconciliation.jsonl`, one row per proposed location cluster with
  every source ID, match evidence, distance, name/address scores, proposed
  inclusion, business type, status, and ambiguity flags;
- `temecula-review-roster.json`, containing 100% of ambiguous, truck, ghost,
  closure, and duplicate decisions plus the deterministic 10% ordinary review
  sample; and
- `temecula-source-summary.json`, containing source counts, overlap counts,
  exclusions, pre/post-cap counts, observation times, licenses, and hashes.

Do not label the result a census unless an acceptable independent frame exists
and every required review is complete.

## C. Guardian-Only National Candidate Frame

Create `guardian/national-candidates.jsonl` from the deduplicated union of
existing SeeFood identities and one versioned, currently authorized national
identity snapshot. Overture Places is the preferred public snapshot.

This file is for the Benchmark Guardian only. The Lead and implementation
workers must not inspect its clear IDs or rows.

Each row must have:

- `stablePublicId` from a public/provider source, never an internal UUID;
- public name, coordinates, coarse address, source version, and observation
  time;
- eligibility and exclusion reason;
- `marketSize`: `top20`, `otherTop50`, `msa51_387`, `micropolitan`, or
  `noncore`;
- `businessForm`: `chain`, `singleIndependent`, `smallMulti`, `foodTruck`,
  `ghostKitchen`, or `nontraditional`;
- `webStrength`: `structured`, `orderingOnly`, `weakPdfSocial`, or `none`;
- `lifecycle`: `stableOpen`, `newWithin12Months`, or
  `closedMovedReplaced`;
- exactly one of the 12 registered cuisine groups;
- one Census division;
- normalized brand key;
- `isTemecula`, `isLegacyBenchmark`, `isDevelopment`, `isTestFixture`, and
  duplicate-group fields; and
- field-level evidence and `verified`, `inferred`, or `unknown` confidence.

Unknown values cannot satisfy a quota. Do not invent truck, ghost, lifecycle,
website, cuisine, or market assignments. The frame must contain enough
verified candidates to satisfy every published quota and yield 24 feasible
alternates. If it does not, stop and report the exact deficient cells.

The Guardian, not the exporter, creates the secret seed, seed commitment,
selection ranks, 120-record holdout, and 24 alternates. The exporter must not
order candidates to influence selection.

## D. Claimed Baseline Snapshot

Create entity-level files for every selectable Temecula record and every
Guardian-selected national record:

- `baseline-entities.jsonl`;
- `baseline-menu-items.jsonl`;
- `baseline-photo-records.jsonl`;
- `baseline-comparison-claims.jsonl`; and
- `baseline-coverage-metrics.json`.

Use the installed production entity-level semantics and separately recompute
all seven DataLab rungs. Production-derived rungs remain `claimed` unless the
gold evidence supports them. Include inactive/status records needed to reject
false active coverage, but do not let them improve the active denominator.

For menus preserve source record, item key, canonical key, item name,
orderability/active state, source observation time, and Management-control
evidence. For photos preserve opaque photo ID, restaurant/entity join hashes,
menu/canonical keys, declared author type, source family, source observation
time, active/moderation/useful/storefront/menu-photo flags, dimensions, byte
hash or perceptual hash if already stored, rights status, and the evidence
references below. Do not export live image URLs.

## E. Bounded Gold-Evidence Packet

Include every claimed comparison dish if there are at most 100. If there are
more, use a reproducible source- and cohort-stratified sample of exactly 100.
For each audited claim include:

- locally rendered image bytes already available to the main thread;
- current-menu source record or sanitized render;
- item-attachment evidence;
- Management/Customer author evidence;
- source-level rights/retention/display decision and evidence;
- accessibility and moderation evidence;
- stored and newly computed byte/perceptual hashes; and
- opaque, independently shuffled Guardian IDs.

Do not download missing evidence. Mark it `unverifiable`. Remove EXIF, XMP,
ICC, faces where not needed, contributor IDs, usernames, names, emails, phone
numbers, and free text that can identify a person. Preserve only the minimum
source/author proof needed for audit.

Also include a reproducible sample of up to 25 apparently rich-but-unpaired
entities from each cohort so the Guardian can check false negatives. The total
packet is capped at 150 entities and 1,500 photos. If the claim packet alone
would exceed either cap, stop and report the required size.

## F. Integrity And Anti-Leak Checks

Create:

- `queries.sql` or numbered SQL files containing every executed statement;
- `SHA256SUMS`;
- `redaction-log.json` with a completed result for every payload file;
- `guardian/id-map.json`, readable only by the Guardian process; and
- `README.md` describing regeneration and every unavailable field.

The final checks must prove:

- no secrets, credentials, tokens, connection strings, private hostnames, PII,
  full live URLs, or internal UUID rank inputs;
- every manifest hash matches;
- every image decodes and contains no EXIF, XMP, or ICC metadata;
- every candidate selection and sample reproduces from registered public IDs;
- Temecula and national records do not overlap;
- no legacy benchmark, test, fixture, or development record enters the
  national frame; and
- production output and exporter recomputation match field-for-field before
  DataLab gold gates are applied.

## Acceptance

The handoff is accepted only when:

1. an independent local frame is present, or the result is explicitly stopped
   as a candidate baseline rather than called a census;
2. the Guardian proves every national quota plus 24 alternates is feasible;
3. stable public/provider IDs drive every deterministic rank;
4. all seven rungs are reproducible for the same snapshot;
5. claimed and verified comparisons remain separate;
6. the bounded gold packet is complete or explicitly marks missing evidence
   unverifiable;
7. integrity and redaction checks pass; and
8. no DataLab safety boundary was crossed.

If any item fails, preserve the bundle under an explicitly invalid name and do
not overwrite a previously accepted bundle.
