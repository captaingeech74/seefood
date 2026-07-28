# Experiment: DL-002 Frozen Temecula And National Baseline

## Decision Target

What is SeeFood's real claimed-versus-verified coverage on a defensible
Temecula development cohort and a hidden, nationally representative holdout?

## Hypothesis

A forced-read-only snapshot, an independent local identity/status frame, and
frozen cohorts will reveal the largest real coverage gap and prevent provider
records or weak stored flags from being reported as comparison-ready coverage.

## Registered Bounds

- at most 500 selectable Temecula restaurant candidates;
- exactly 120 hidden national records plus 24 alternates;
- at most 100 claimed comparison dishes audited, or every claim when fewer;
- at most 150 evidence entities and 1,500 photo records;
- no production or provider write, paid service, material paid quota, crawl,
  deployment, infrastructure change, push, or merge.

## Preparation Cycle — 2026-07-27

The official geographic boundary was locked:

- 2025 TIGER/Line incorporated-place file for California;
- state FIPS `06`, place FIPS `78120`, GEOID `0678120`;
- exactly one active `Temecula city` Polygon feature;
- bounded local files and hashes recorded in `TEMECULA_BOUNDARY.md`.

The local-frame qualification initially found useful but incomplete public
pages. An independent Source Scout then located the official machine-queryable
Riverside County DES Food Facility Permits layer:

- public `Query,Extract` capability and a 2,000-record response cap;
- active statuses and stable permit/establishment IDs;
- a bounded 979-row envelope query followed by local polygon filtering;
- 822 permit rows and 808 unique establishment IDs inside Temecula;
- 75 home-based rows withheld, leaving 747 permit rows and 733 unique
  establishment IDs for internal reconciliation; and
- no published license or terms-of-use text, so internal benchmark use is kept
  separate from any future redistribution decision.

These are candidate permits, not 808 restaurants. The source includes schools,
markets, hotels, nonprofits, caterers, mobile bases, temporary facilities, and
other excluded or ambiguous types. It requires deduplication, provider
reconciliation, and manual eligibility review.

An independent Adversarial Verifier reproduced the polygon classification with
a separate winding-number implementation: 822 inside-polygon rows and 747
after home-based withholding. It found no boundary ambiguity. It confirmed that
the candidate/status claim is supported, the restaurant-census claim is not,
and external reuse remains unproved. The exact bounded acquisition requests
and deterministic local transformation are committed as separate scripts.

No local authorized national candidate snapshot contains the registered
stratification fields. Therefore the Guardian could not honestly freeze the
120-record holdout from current local files.

The founder subsequently removed two artificial requirements: ghost-kitchen
classification and opening date/recency are optional context and may not block
DL-002 or any later experiment. Business-form quotas now leave 12 records
unrestricted, and the status margin is simply 108 open/orderable locations plus
12 confirmed closure/move/replacement sentinels.

## Result

DL-002 is reproducibly prepared but not complete. The city boundary and
independent local candidate/status frame are frozen. The reconciled restaurant
cohort, provider union, hidden national holdout, evidence packet, and baseline
metrics are not frozen.

No coverage metric improved. No restaurant, raw record, or image is counted as
new coverage.

## Decision

**Continue only after the read-only handoff.**

Do not start DL-004, DL-007, DL-012, or a Management connector until the
accepted bundle freezes both cohorts and establishes the baseline. The permit
frame does not become a census until reconciliation and eligibility review
remove non-restaurants and resolve duplicates.

## Cost And Impact

$0. One 9.4 MB official Census archive, one 47 KB single-feature TIGERweb
response, and one 535 KB/979-row county permit response were downloaded to
ignored lab storage. There was no production read or write, paid provider
query, model call, paid quota, account, crawl, outreach, deployment,
infrastructure change, push, or merge.

## Next Action

The main SeeFood thread should generate the exact sanitized bundle in
`DL002_INPUT_HANDOFF.md`. The DataLab will reconcile the provider inputs with
the county frame. It will validate the national bundle before inspecting any
clear cohort records; the Guardian will own the national IDs and secret seed.
