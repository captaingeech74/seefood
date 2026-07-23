# Experiment: DL-000 Setup And Baseline Inventory

## Decision Target

Can the existing 25-restaurant benchmark and production coverage metric serve
as the DataLab baseline without modification?

## Hypothesis

A static audit will show that existing source history and code are reusable,
but the benchmark must be revised before it can measure strongly matched
Management-versus-Customer comparison dishes.

## Safety

Confirmed: no production reads or writes, deployment, infrastructure change,
paid service, quota use, image download, or crawl. Review was limited to the
isolated worktree and committed local evidence.

## Cohort

The committed 25-record legacy Temecula-area benchmark and its three stored
result files. No national holdout existed to evaluate.

## Method

1. Read the DataLab charter/control files, acquisition backlog, metro rollout,
   infrastructure decision, and relevant acquisition history.
2. Trace the benchmark, acquisition, crawler, normalization, contribution, and
   coverage paths through code and SQL.
3. Summarize the stored benchmark JSON with local `jq`.
4. Have a separate Benchmark Guardian inspect the benchmark and cohort design.
5. Define replacement evidence rules, Temecula census rules, national holdout,
   and the next zero-write experiment.

## Baseline

No DataLab baseline existed. Historical source results were operational
evidence only.

## Result

- The legacy set has 25 hand-picked records, not a census.
- Stored runs contain no Management/Customer counts or comparison dishes.
- Average photos per restaurant were 10.12, 6.16, and 11.24 across the three
  stored dates. Average reported menu matches were 0.92, 0.96, and 0.72.
- Only one restaurant reached seven reported menu matches in each stored run.
- The harness defaults to production and calls `/api/dishes`; cache misses
  persist results, so the DataLab cannot run it.
- The harness omits coordinates and address and can therefore overwrite a
  restaurant with `0,0`; its current name-based tag also no longer bypasses a
  fresh place-ID corpus hit.
- The production coverage function treats canonical dish linkage as a match.
  The persistence code can create that linkage from an AI label even when it
  did not match a known current menu item.
- Google author provenance, normalized-name grouping, substring item matching,
  inherited chain menus, and identity merges lack an independent precision
  audit.
- The code contains more acquisition paths than the initial registry listed:
  Overture, Common Crawl, seven newer ordering-provider families, brand
  templates, Management menu capture, and contribution workflows.

Incremental restaurants, menus, matched photos, comparison dishes, and coverage
improvement: zero. This setup cycle changed measurement, not coverage.

Runtime was local review time. Money and paid quota: $0.

## Independent Verification

The Benchmark Guardian independently reviewed the legacy cohort, result files,
benchmark harness, coverage semantics, and proposed census/holdout structure.
It confirmed that the comparison baseline is unknown, found the coordinate and
cache-bust defects above, specified a 12-restaurant calibration probe, and
strengthened the hidden holdout to 120 orthogonally stratified records. The
implementation worker did not evaluate a connector or coverage gain.

## Decision

**Revise.**

Keep the committed history, parser fixtures, and stored results as diagnostic
inputs. Replace the legacy benchmark as the DataLab decision instrument with
`BENCHMARK_SPEC.md`, a Temecula census, a hidden locked national holdout, and a
forced-read-only baseline.

## Plain-English Meaning

SeeFood does not yet know its verified starting number of real comparison
dishes. The old scoreboard can say how many photos or loose labels appeared,
but not whether the same dish has a trustworthy Management and Customer pair.
The lab now has a precise way to measure that without touching production.

## Next Action

Run DL-001 exactly as queued: compare SQL-claimed and Guardian-verified
comparisons on 12 deterministically selected Temecula candidates and no more
than 120 locally supplied photo/evidence records. Use it to identify failure
mechanisms, not estimate a population error rate. Do not fetch missing evidence
live.
