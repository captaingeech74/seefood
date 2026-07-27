# Experiment: DL-001 Existing Comparison-Signal Calibration

## Decision Target

Can the current SQL comparison signal be calibrated against 12 actual Temecula
restaurants without production writes, source calls, or invented evidence?

## Hypothesis

At least one SQL-claimed comparison pair will fail, or lack evidence for, a
DataLab gold requirement.

## Safety

No production read or write, API route, source call, image download, credential,
paid service, quota, deployment, or infrastructure change occurred. Inspection
was limited to the isolated repository and Git history.

## Cohort

The pre-registered cohort required:

- four SQL-claimed comparison-ready Temecula restaurants;
- four menu/photo-rich but unpaired restaurants;
- four sparse restaurants; and
- at most 120 locally supplied photo/evidence records.

No cohort was selected because the required bucket evidence was absent.

## Method

1. Inventory committed benchmark results, parser fixtures, ignored lab paths,
   repository history, schemas, migrations, and comparison code.
2. Check whether every bucket can be defined from local evidence.
3. Check for a credential-free, forced read-only database connection.
4. Stop under the registered rule if the safe evidence bundle is unavailable.
5. Ask the independent Benchmark Guardian to repeat the availability and stop
   assessment.

## Baseline

Unknown. The three historical benchmark files report only aggregate
`photo_count`, `menu_matched_count`, source summaries, and latency. They do not
report comparison dishes.

## Result

DL-001 stopped before selection:

- no committed or ignored local bundle contains photo IDs, URLs/renders,
  Management/Customer author types, menu/canonical dish keys, stored comparison
  flags, menu observation times, hashes, moderation, rights, accessibility, or
  duplicate evidence;
- parser fixtures are synthetic or Management-only and cannot replace actual
  Temecula comparison candidates;
- the benchmark's `menu_matched_count` counts API `isMenuMatch` labels and
  cannot identify a Management/Customer pair;
- no safe database credential or forced read-only connection exists in this
  worktree; and
- therefore zero of the required three four-restaurant buckets can be proved.

The code review preserved why calibration remains necessary:

- `savePhotos` creates canonical dishes from Gemini labels, while
  `coverage_v2_metrics` treats any canonical ID as matched. Opposite-author
  photos can therefore share a label-derived key without independent current-
  menu evidence.
- label matching elsewhere permits generic substring matches against a limited
  menu slice, so a weak name match can attach the wrong item.
- Management and Customer provenance can be inferred mechanically from source
  or legacy attribution without preserved author evidence.
- the July 18 migration and `refreshRestaurantPhotoSignals` can group
  source-specific menu items or raw Gemini labels while omitting active,
  moderation, storefront/menu-photo, accessibility, rights, and duplicate
  gates.
- stored flags can become stale when source records retire because the refresh
  logic includes inactive companions and is not rerun after every retirement.
- `coverage_v2_metrics` recomputes active author pairs but still omits current-
  menu observation, strong item evidence, accessibility, distinct image
  content, moderation, rights, quality/orderability, and active location
  status.
- URL-only deduplication allows the same image bytes under different URLs to
  form both sides of a claimed pair.
- V2 excludes `test_fixture` but not every non-active location status.
- upload metadata is client-supplied, while accepted uploads become approved
  Customer photos and may create canonical dishes.

The stored-flag mechanism and V2 recomputation are not equivalent. A resumed
DL-001 must record which mechanism produced each claim and audit them
separately.

These are possible failure mechanisms, not measured errors.

Incremental coverage, verified comparison dishes, and precision improvement:
zero. Runtime was bounded local inspection. Cost was $0.

## Independent Verification

The Benchmark Guardian independently inspected the benchmark files, local
paths, Git history, SQL migrations, and comparison code. It confirmed that the
4+4+4 packet cannot be formed, both registered stop conditions are met, and
the correct decision is to stop and quarantine the hypothesis as untested—not
reject it.

The Source Scout separately found no Customer provenance, current-menu,
accessibility, duplicate, or SQL-claim evidence in local fixtures.

No implementation worker evaluated its own result.

## Decision

**Quarantine / untested.**

Do not infer that the SQL is wrong or correct. Do not select by aggregate
`menu_matched_count`, use synthetic fixtures, fetch live photos, or call a
route that may persist.

## Access Action

Request a bounded sanitized handoff from the main SeeFood thread. Do not give
the DataLab production credentials.

## Plain-English Meaning

The old results kept the scoreboard but threw away the evidence needed to
check it. The lab cannot honestly say whether SeeFood has zero, one, or many
real Management-versus-Customer comparisons from those files.

## Next Action

Pause experiments until the main thread supplies the bundle specified in
`DL001_INPUT_HANDOFF.md`. Then resume DL-001 unchanged with the Guardian's
blind audit.

## Resume Attempt — 2026-07-27

### Supplied Bundle

The main thread supplied an ignored, local, sanitized bundle under
`data-lab/raw/baseline/DL-001/`. The DataLab made no live or production call.

Mechanical validation passed:

- PostgreSQL attestation: `REPEATABLE READ READ ONLY`, followed by `ROLLBACK`;
- 183 candidates in the calibration rectangle;
- supplied bucket counts: 6 SQL-claimed, 76 rich-unpaired, 25 sparse, and 76
  outside the three selection buckets;
- exactly 4+4+4 selected by the registered restaurant hash rank;
- 980 active menu evidence rows and 82 photo evidence rows, with no restaurant
  above 10 photos and no total above 120;
- all SHA-256 manifest entries passed;
- every evidence image decoded as WebP, and none contained EXIF, XMP, or ICC
  metadata chunks; and
- an independent scan found no obvious credential, JWT, email value, forbidden
  personal-data key, or live URL.

### Reproducibility Failure

The bundle cannot calibrate the current production V2 signal:

1. The export query scopes restaurants by restaurant coordinates and groups
   claims by `restaurant_id`. The production function at the bundle's recorded
   commit scopes `restaurant_entities`, includes all restaurants attached to
   each scoped entity, and groups claims by `entity_id`. This can change the
   candidate frame, photo associations, comparison counts, buckets, and the
   selected claimed cohort.
2. The Guardian IDs preserve bucket order: `G01`–`G04` are claimed,
   `G05`–`G08` are rich-unpaired, and `G09`–`G12` are sparse. The protocol
   itself therefore reveals every supposedly withheld bucket.
3. Multiple claimed restaurants have multiple claimed dish keys, but the
   bundle records no deterministic selection rule for `selectedClaimDishKey`.
   It also omits the full candidate photo roster or per-photo ranks needed to
   reproduce the non-claim sample and independently prove that no claimed-dish
   photo was omitted.
4. The redaction result says `passed` while its environment-secret scan is
   still marked `run_before_completion`, and it is not a per-file log.
5. Historical stored `comparison_ready` signals are separated in filename but
   are still described as claims even when the exported dish key is null or
   the flagged row is inactive. They are not current V2 comparison claims.

The first issue alone is decisive. DL-001 stopped at the resume gate before
accepting a calibration metric.

### Frozen Guardian Observation

The Benchmark Guardian reviewed all 12 opaque records and all 82 images without
opening the unblinded files. Because the packet order and upstream semantics
failed, its findings are exploratory only:

- four same-dish-key candidate groups and five Management/Customer pair
  combinations;
- zero verified comparison dishes and zero verified comparison-ready
  restaurants from the evidence supplied;
- one Customer soup image was only a weak match to the claimed dish;
- one claimed Customer image was a cropped/re-encoded copy of its Management
  counterpart;
- every Management and Customer author class relied on a heuristic requiring
  review;
- all 82 images had `rightsStatus: unreviewed`; and
- no record contained affirmative operating-status evidence.

The Guardian also found a Management duplicate pair not grouped by the packet's
dedupe evidence. These examples support the need for the gold gates, but they
must not be converted into a production error rate.

### Independent Verification

The Adversarial Verifier independently confirmed the entity-versus-restaurant
semantic mismatch, bucket-order leak, unreproducible claimed-dish/photo
selection, incomplete redaction gate, and stored-signal terminology problem.
No implementation worker evaluated its own result.

### Decision

**Quarantine / untested.**

The original hypothesis remains plausible but is not measured against the
actual production V2 population. No verified coverage or precision metric
changed.

### Cost And Impact

$0 DataLab cost. No production read or write by the DataLab, source request,
model call, crawl, deploy, infrastructure change, paid quota, push, or merge.

### Next Action

Regenerate the bundle under the corrected `DL001_INPUT_HANDOFF.md`, then rerun
DL-001. Do not advance to DL-002 or a connector from this invalid sample.
