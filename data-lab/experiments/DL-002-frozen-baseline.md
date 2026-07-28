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
- exactly 120 hidden national records plus 12 alternates;
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
DL-002 or any later experiment. The status margin is simply 108
open/orderable locations plus 12 confirmed closure/move/replacement sentinels.

A follow-on simplicity review removed exact website-strength and cuisine
quotas plus mandatory food-truck and nontraditional-venue counts. Those fields
remain useful reported slices when known. The hard national design now protects
only geography, market size, chain/independent representation, operating-status
sentinels, brand concentration, and blind selection.

The read-only handoff is also split into two bounded stages. Stage 1 supplies
the Temecula/provider and Guardian-only national candidate frames. After the
Guardian freezes the hidden cohort, Stage 2 exports only the selected baseline
and gold evidence by opaque public-ID hash. This removes the circular
requirement to export evidence for records that do not yet exist as a cohort.

## Result

Stage 1 is accepted. Stage 2 evidence and baseline metrics remain pending.

The corrected read-only bundle passed every mechanical input gate:

- manifest hashes and redaction checks passed;
- the database proof used `REPEATABLE READ READ ONLY`, verified
  `transaction_read_only=on`, recorded unchanged WAL positions, and rolled
  back;
- all selectable records used stable public/provider IDs rather than internal
  UUIDs;
- all Temecula coordinates fell inside the locked city polygon; and
- the bundle contained 796 SeeFood, 312 OpenStreetMap, 425 Overture, and 1,727
  Guardian-only national candidate rows.

The Temecula reconciliation produced 639 provider identity clusters. An
independent Adversarial Verifier:

- audited all 260 automatic cross-source merges and found zero obvious errors
  (95% Wilson lower bound 98.5%);
- supplied 20 additional merge groups covering 55 provider records;
- verified the resulting 397 open candidates, 241 unknown-status
  identity-only candidates, and one closure;
- identified one unresolved active co-location, which was excluded; and
- left a frozen 396-record active development cohort plus the separate closure
  ledger.

The independent county omission challenge froze 100 reviewed records: 48
likely genuine provider omissions/status candidates, 20 already represented,
eight likely ineligible, and 24 unresolved. County rows were not added to the
cohort and do not count as restaurants or coverage.

The Benchmark Guardian normalized the national candidate frame to 1,464
eligible rows and froze 120 hidden records plus 12 direct replacements. The
holdout exactly satisfies every registered hard market, census-division,
business-form, operating-status, brand-cap, and same-brand-distance rule. It
contains no unknown hard assignment. The seed and clear identities remain
ignored and private. `NATIONAL_HOLDOUT_LOCK.md` records the aggregate design,
portable recipe, and cryptographic commitments without unblinding it.

No coverage metric improved. No restaurant, raw record, or image is counted as
new menu, Management-photo, Customer-photo, or comparison coverage.

## Decision

**Continue to DL-002 Stage 2.**

The main SeeFood thread should export Stage 2 evidence for only the 120 selected
and 12 alternate public-ID hashes in the Guardian's ignored handoff. The clear
holdout manifest must remain unavailable to the exporter and the Lead until
the Guardian freezes blind evidence decisions.

Do not start DL-004, DL-007, DL-012, or a Management connector until Stage 2
establishes the claimed-versus-verified baseline.

## Cost And Impact

$0 incremental money. Stage 1 used the already prepared bounded read-only
bundle and local Node scripts. There was no production write, paid provider
query, model call, paid quota, account, crawl, outreach, deployment,
infrastructure change, push, or merge.

## Next Action

The main SeeFood thread should generate the exact Stage 2 sanitized evidence
bundle in `DL002_INPUT_HANDOFF.md`, using only
`raw/holdout/national-v1-stage2-hashes.json` for national selection. The
Guardian remains the only role allowed to inspect the hidden national IDs
before blind evaluation is complete.
