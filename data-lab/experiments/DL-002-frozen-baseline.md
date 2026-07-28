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

DL-002 is complete with a `Revise / baseline established` decision.

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

Stage 2 passed its mechanical controls:

- every one of 228 registered file hashes matched;
- the production transaction was `REPEATABLE READ READ ONLY`, had
  `transaction_read_only=on`, recorded unchanged WAL positions, and rolled
  back;
- production SQL and the independent recomputation matched exactly for all
  seven legacy fields across 393 uniquely mapped production entities;
- all 396 Temecula, 120 national selected, and 12 national alternate hashes
  matched the frozen cohorts with zero overlap or clear national leakage; and
- 320 bounded evidence records stayed under the registered 1,500-photo and
  150-entity caps.

Benchmark Specification version 0.2 records a founder policy correction:
bounded image reads from public or already-authorized recorded locators are
allowed. Stage 2's 214 recorded-locator reads are valid evidence. The
prohibitions on access-control bypass, rate-limit evasion, unbounded crawling,
material paid quota, private data, and production writes remain.

The exporter required two metric corrections. It used 516 as the denominator,
but the registered active content denominator is 504: 396 Temecula plus 108
national open/orderable restaurants. Twelve national closure/move/replacement
sentinels are separate and never improve content coverage. It also reported
the production seven-photo threshold as the useful-photo rung, which requires
only one useful photo.

The corrected claimed ladder is:

| Rung | Count | Active percentage |
|---|---:|---:|
| Identified | 504 | 100% |
| At least one stored useful-photo signal | 150 | 29.76% |
| Known current menu | 84 | 16.67% |
| Seven current-menu attachment candidates | 64 | 12.70% |
| 20% current-menu attachment candidates | 60 | 11.90% |
| 50% current-menu attachment candidates | 46 | 9.13% |
| Claimed comparison-ready | 6 | 1.19% |
| Verified comparison-ready | 0 | 0% |

The attachment and usefulness rungs remain claimed rather than visually
verified across the full cohort. The strategic Management-side overlap is also
small: 78/504 have a current menu plus one declared Management photo, and
68/504 have a current menu plus one declared matched Management photo. None of
the 108 national active holdout records matched production, so every national
content rung after identity is zero.

The Guardian audited all 320 evidence records:

- 214 rendered Management records and 106 unavailable records;
- 175 exact item matches, 39 rejects, and no strong or weak grades;
- 171 useful nonduplicate food images;
- Management provenance 214/214, with a 95% Wilson interval of
  98.24%–100%; and
- item-match precision 175/214 = 81.78%, with a 95% Wilson interval of
  76.06%–86.37%, below the promotion gate.

The pooled result is not a fair description of each source:

- DoorDash: 168/168 exact item matches, 164/168 useful food images, and 168/168
  Management provenance; and
- schema.org: 7/46 rendered exact item matches, 39/46 rejects, and only 7/46
  useful food images, with another 6 records unavailable.

The packet was selected around claims and rich controls, so these numbers prove
payload quality within the packet but do not estimate national location yield.
Every rights status remained unreviewed. DoorDash therefore becomes a
high-value permission/deal opportunity, not an authorized implementation
recommendation.

All 100 declared Customer evidence photos were unavailable. Every one of the
45 Customer references used by the 21 claimed comparison dishes was therefore
unverifiable; Customer provenance precision could not be calculated. All 320
rights statuses were `unreviewed`. The Guardian verified zero of 21 claims and
retained all as unverifiable. The Adversarial Verifier agreed on zero verified,
identified six duplicate-reject candidates from stored cross-author perceptual
hashes, and left 15 unverifiable. The disagreement is preserved rather than
collapsed into false certainty.

The 25 rich-unpaired Temecula controls produced no verified false negative:
17 remained unverifiable for missing Customer evidence and eight had no
Customer candidate. No national controls were available because none of the
national selected records matched production. Stage 2 also omitted product
status evidence for all 12 national sentinels, so status accuracy is
unverifiable.

No coverage metric improved. No restaurant, raw record, or image is counted as
new menu, Management-photo, Customer-photo, or comparison coverage.

## Decision

**Revise / baseline established.**

The baseline is sufficient for the founder decision because every claim was
audited and missing evidence remained unverifiable. It is not a verified
visual baseline for upper photo rungs, and it does not support promotion of an
existing source.

The measured whitespace justifies one more bounded game-changer qualification
phase. It does not justify a large connector build, commercial commitment, or
transaction-triggered integration without source-specific national reach,
quality, rights, and contribution-yield evidence.

## Cost And Impact

$0 incremental money. Stage 2 made 214 bounded reads from already-recorded
source-image locators under the registered cap. There was no production write,
paid provider query, material paid quota, account, outreach, unbounded crawl,
deployment, infrastructure change, push, or merge.

## Next Action

Kyle and the DataLab should make the go/no-go decision together. If the answer
is go, authorize only a bounded national qualification phase. Require a
Management source or portfolio to show a credible route to at least a
20-percentage-point national current-menu-plus-strong-Management-photo gain.
Require a Customer path to show accessible, rights-valid, exact-item
contributions across multiple national strata. Do not use a trivial doubling
from the verified zero comparison baseline as the Customer game-changer bar.
