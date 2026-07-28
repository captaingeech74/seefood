# DataLab read-only evidence exports

DataLab never receives production credentials. When an experiment needs
production evidence, the main SeeFood thread creates a bounded, sanitized,
local bundle and places a copy in the lab's ignored `data-lab/raw/` directory.
The lab evaluates that evidence offline.

## DL-001 baseline calibration

Run from the normal `main` checkout:

```sh
npm run export:datalab:dl001 -- --mirror "/absolute/path/to/the/datalab/worktree/data-lab/raw/baseline/DL-001"
```

The exporter:

- refuses to overwrite an existing completed bundle;
- uses one direct PostgreSQL transaction opened as repeatable-read and read-only;
- verifies the database's read-only setting before querying evidence;
- executes no mutation, RPC, application route, cache operation, or storage
  write;
- reproduces `coverage_v2_metrics` at the entity level, including every
  restaurant row attached to each scoped entity;
- emits one candidate per entity and samples by deterministic dish/photo rank
  formulas, stopping above 10 photos per entity or 120 photos total;
- records every candidate rank and the complete photo roster for the selected
  claimed dish;
- fetches only the selected image bytes through direct bounded reads;
- creates metadata-stripped 512-pixel WebP evidence renders;
- removes raw URLs, credentials, contributor/customer identifiers and content,
  device/session data, payment data, and precise personal timestamps;
- scans every staged file for loaded environment-secret values and prohibited
  personal-data patterns, recording per-file results and SHA-256 hashes;
- keeps recomputed current V2 claims separate from historical stored flags;
- creates a SHA-256 manifest and a separately shuffled blind Guardian packet,
  while retaining its seed and identity mapping outside the lab mirror; and
- makes both completed copies filesystem read-only.

The generated bundle is ignored by Git. It includes the installed production
metric function, its exact result and an equality proof against the exporter's
recomputation; transaction proof; schema fingerprint; all entity candidates in
the bounded calibration rectangle; separate current and historical signals;
operating/menu/linkage/author/rights/accessibility/moderation evidence; robust
near-duplicate review signals; deterministic selection audits; the completed
redaction record; and the blind Guardian packet.

The rectangle is deliberately labeled as a calibration bound rather than a
Temecula census. DL-001 is meant to calibrate the benchmark. A later census must
use the geographic definition in the DataLab benchmark specification.

If any selected claimed-dish image is inaccessible, a bucket has fewer than
four candidates, the photo bounds would be exceeded, a secret is detected, or
the database does not confirm read-only mode, the exporter fails before
publishing a completed bundle.

An earlier run exercised that stop condition: an Epic Wings candidate was a
restaurant webpage previously proven to be a non-image, but a later transient
fetch failure had made it active again. The main thread repaired the responsible
ingestion rule and re-quarantined only rows already carrying durable rejection
evidence.

The first completed bundle was later rejected because it grouped by restaurant
row rather than production entity. It is retained as invalid evidence under
`DL-001-invalid-restaurant-semantics-2026-07-27`. The corrected bundle has
1,390 entity candidates, exactly 4+4+4 selected entities, 924 current menu rows,
and 78 photo records. It passes exact parity for every exported production
coverage field and records complete inclusion of every photo on each selected
comparison dish.

## DL-007 contribution-funnel baseline

Run from the normal `main` checkout:

```sh
npm run export:datalab:dl007 -- --mirror "/absolute/path/to/the/datalab/worktree/data-lab/raw/baseline/DL-007/main-thread-stage1"
```

The exporter uses one repeatable-read, forced-read-only production transaction
ending in `ROLLBACK`. It exports only whitelisted event fields, first-party
contribution-photo evidence, relevant per-entity eligibility flags, fixed-window
aggregates, exact queries, schema and transaction proofs, and a completed
redaction/hash manifest. Every production identifier is replaced with a
type-separated bundle-only hash derived from a random seed whose commitment is
delivered while the seed remains in the main thread's ignored private path.

The accepted baseline excludes `test_fixture` entities from funnel results but
retains their contribution rows as explicitly marked evidence. It does not
invent the missing pre-upload funnel: prompt impressions, prompt opens, upload
starts, cancellations, client failures, API failures, and event-delivery
failures are all recorded as unmeasurable.
