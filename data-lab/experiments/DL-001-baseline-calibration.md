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
