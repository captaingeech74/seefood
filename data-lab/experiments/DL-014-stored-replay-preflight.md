# DL-014 — DoorDash Stored-Replay National-Ceiling Preflight

## Preregistered Decision Target

Decide whether already-stored replay artifacts and already-sanitized DataLab
evidence are sufficient to support, or at least specify without invented data,
a nationally stratified Management-source ceiling test capable of changing the
grand experiment decision.

This preregistration is recorded before the Cycle 7 artifact inventory.

## Hypothesis

The stored evidence contains enough independent restaurant-level DoorDash
observations to design a bounded national ceiling test that could measure at
least a 20-percentage-point incremental current-menu-plus-strong-Management-
photo gain across at least two national strata, while preserving the finish
line's item-precision, rights, provenance, refresh, failure, duplicate, and cost
requirements.

Existing selected-packet precision alone cannot pass this hypothesis.

## Evidence Required

The stored material must establish all of the following without a live request,
credential, hidden-holdout identity, or synthetic coverage assumption:

1. a reproducible inventory separating raw/replayable DoorDash response
   artifacts, normalized rows, rendered images, and prior human judgments;
2. at least 30 distinct restaurants across at least two non-overlapping
   national geographic or market-size strata for a future ceiling design;
3. a defensible sampling frame and denominator that can measure restaurant
   discovery, correct store match, rendered retrieval, current-menu yield,
   item-photo population, and incremental coverage beyond the existing stack;
4. preserved item and image evidence sufficient for at least 35 independent
   exact/strong judgments and the finish-line Wilson calculation;
5. explicit separation of selected-packet item precision from population yield;
6. measurable failures, duplicates, runtime/cost, and a repeatable refresh
   method; and
7. an explicit provenance and usable-rights/controller-deal path.

Stored evidence may support the design even when it cannot estimate the
national result, but only if it identifies a valid frame, sampling unit,
strata, fields, audit packet, and stop rules without unblinding the locked
holdout.

## Bound

- Read only files already present in this DataLab worktree at preregistration.
- Use sanitized aggregates and opaque joins; do not tune against or reveal
  hidden-holdout identities.
- Make zero network requests, including no DoorDash sitemap, store page, image,
  API, documentation, or search request.
- Use no account, credential, browser session, production database/R2 data,
  paid service, or external quota.
- Do not add mock records, synthetic payloads, schema-only results, or raw photo
  counts to coverage.
- Do not download or re-fetch an image, discover a replacement URL, run a
  crawler, or change the bot-control boundary.
- Code inspection and local parsing of stored artifacts are allowed.
- Money ceiling: $0. External request ceiling: 0. New image ceiling: 0.

Optional descriptors such as ghost-kitchen status and opening recency are not
requirements.

## Stop Condition

Stop the evidence preflight without expanding scope if the stored inventory
lacks a nationally stratified, restaurant-denominated replay corpus capable of
measuring the +20-point yield question, or if any required numerator,
denominator, provenance, rights, refresh, or failure evidence would require a
live request, credential, production access, hidden-holdout unblinding, paid
quota, or bot-control encounter.

On that stop, record zero coverage improvement and convert DL-014 to a concrete
access/decision brief. Do not substitute the selected Pacific item-quality
packet, a parser fixture, sitemap geography, or projected records for national
yield.

## Preregistered Decisions

- **Keep:** stored evidence supports the full national ceiling measurement and
  every finish-line gate.
- **Revise:** stored evidence supports an exact test design but not the result;
  preserve DL-014 behind the identified permission/boundary decision.
- **Reject:** stored evidence disproves technical feasibility or shows that even
  authorized retrieval could not reach the game-changer bar.
- **Quarantine:** evidence integrity, selection, identity, or provenance defects
  prevent reliable use.

Access action is recorded separately from technical value.

## Cycle 7 Result

**Revise / Needs a decision.**

The preregistered stop condition fired. Existing files support a precise
future test design and preserve potentially High technical value, but they do
not contain a nationally stratified, restaurant-denominated replay corpus.
National yield, rights, original provenance, refresh reliability, retrieval
failure rate, duplicates, and cost therefore remain unmeasured.

Verified coverage improvement is zero.

## Reproducible Stored Inventory

### Selected DL-002 item/image packet

The valid Stage 2 bundle passed all 228 listed hashes. Its DoorDash slice
contains:

- 168 rendered, item-attached records across 26 opaque entities;
- 168/168 exact item judgments, or 100%, with an independently recomputed 95%
  Wilson interval of 97.76%–100%;
- 164/168 useful-food judgments, or 97.62%, with a 95% Wilson interval of
  94.04%–99.07%;
- exactly one attached menu item for each record; and
- 168/168 rights statuses `unreviewed`.

This packet was selected around existing claims and rich-unpaired controls in
the Temecula development cohort. The national cohort had zero production
matches and supplied zero DoorDash evidence records. The result proves
excellent conditional item alignment in the selected packet; it does not
estimate discovery, store-match, menu, image-population, or incremental
national restaurant yield.

The wider sanitized baseline contains 9,340 DoorDash-labeled menu rows across
79 development entities and 4,490 DoorDash-labeled photo rows across 63
development entities. It is normalized corpus state, not replay material:

- no raw DoorDash store response is retained;
- none of the 4,490 photo rows has a bound source-snapshot hash;
- all 4,490 rights statuses are unreviewed; and
- rows span several observation dates, but no stored request ledger measures
  attempted restaurants, correct discovery, response status, parsing failure,
  machine cost, or repeat retention.

Raw row volume cannot be converted into a source hit rate or coverage
denominator.

### Later selected packet

DL-007 Stage 4 independently found 100/100 post-unblind exact/strong item
matches, with a 95% Wilson interval of 96.30%–100%, across 43 restaurants. Its
own frozen warning says the sample is selected from one Pacific development
market and is not national-yield evidence. It also produced no approved
Management rights or comparison coverage.

### Parser and discovery fixtures

The two stored DoorDash test files passed 14/14 local assertions:

- the RSC fixture represents one named restaurant and constructs a two-item
  payload in test code; it is not the raw page and contains no item-image
  field, retrieval record, rights, or second observation;
- the sitemap fixture contains ten URLs from Temecula/Murrieta ambiguity cases,
  including a catering duplicate; it is not a sampled national store frame;
  and
- one test named `does not match on a single generic word alone` actually
  asserts that the query `Cafe` matches `Swing Inn Cafe`. The passing label
  masks a known false-positive identity case, so future evaluation must audit
  every restaurant match rather than credit the fixture count.

The stored 13,915-byte sitemap index still hashes to
`cac7359828af65416a268ad13db30f31b2cc8e6e68ef166ee7a86e2e09de3dc4`
and lists all 50 states, DC, and Puerto Rico. It proves geographic discovery
indices exist. It contains no restaurant rows, menus, item images, provenance,
rights, or source yield.

The only stored benchmark aggregate contains 25 development restaurants and
reports zero DoorDash hits/items on July 6, before the later sitemap and RSC
fixes. It is a valid historical failure of the old path, not a measurement of
the corrected path.

## Gate Assessment

| Preregistered requirement | Result |
|---|---|
| Reproducible inventory | Pass |
| At least 30 restaurants across two national strata | Fail: zero national DoorDash replay restaurants |
| National restaurant denominator and source funnel | Fail |
| At least 35 preserved item judgments | Pass only for selected Pacific quality; invalid for national yield |
| Separate precision from yield | Pass |
| Failures, duplicates, runtime/cost, repeat refresh | Fail |
| Original provenance and usable-rights path | Fail; all measured rights are unreviewed |

The hypothesis is not technically rejected. The evidence boundary, not a
measured low yield, causes the failure.

## Exact Future National Ceiling Test

No part of this design is authorized by Cycle 7. It becomes executable only
after written DoorDash consent or a separate founder decision explicitly
authorizes the bounded retrieval and downstream-use boundary.

1. Freeze implementation and matching rules before the Benchmark Guardian
   releases any evaluation challenge.
2. Select 30 restaurants: 24 from the locked national frame and six Temecula
   validation restaurants. The national slice uses 12 major-metro and 12
   smaller-metro/rural records across at least two census divisions. Ghost
   kitchens, opening recency, exact cuisine balance, and website strength
   remain optional descriptors, not quotas.
3. The Guardian owns clear identities and preregistered stratum weights. The
   worker receives only the minimum one-shot challenge needed after code
   freeze and may not tune on holdout outcomes.
4. Cap the initial probe at 30 store-page requests and 300 item-image reads,
   at most ten deterministically selected item images per restaurant. Record
   every discovery miss, ambiguous/wrong store, response failure, challenge,
   parse failure, empty menu, image-less menu, duplicate, byte failure,
   runtime, request count, and cost.
5. Require current-menu evidence, correct restaurant identity, explicit
   item-image linkage, useful food content, original provenance class, reviewed
   display/retention/combination/deletion rights, and deduplication against the
   existing stack before a restaurant counts.
6. Audit every restaurant match and at least 35 deterministic item-image
   records. Require at least 95% exact/strong point precision, a 95% Wilson
   lower bound of at least 90%, and zero wrong-restaurant links.
7. Compute the preregistered weighted incremental national restaurant rate.
   It must be at least 20 percentage points; projected photos or menu rows do
   not count. Report the equivalent increment against the 108-record active
   national frame.
8. Run one separately capped repeat within the authorized refresh window.
   Require at least 95% retained eligible records or explain every legitimate
   menu/removal change. Propagate removals and measure repeat cost.
9. Stop on any access-control encounter; no retry rotation, evasion, alternate
   identity, or boundary expansion is allowed. Also stop on missing rights,
   inability to distinguish provenance, any wrong restaurant, point precision
   below 95%, Wilson lower bound below 90%, weighted yield below 20 points, or
   economics without a plausible national ceiling.

This design can change the grand decision. The files available in Cycle 7
cannot populate its result.

## Independent Evaluation

The Adversarial Verifier:

- independently recomputed stored record/entity counts and Wilson intervals;
- verified the Stage 2 manifest;
- reran both stored parser/discovery test files;
- inspected fixture construction rather than trusting test names;
- separated normalized rows, rendered evidence, code fixtures, sitemap
  geography, and historical narrative; and
- did not open hidden-holdout review data or issue a network request.

## Coverage, Cost, And Finish-Line Movement

- New current menus: 0.
- New strong Management-photo restaurants: 0.
- New comparison dishes: 0.
- National yield estimate: none.
- Item precision: strong only in selected Pacific packets.
- Money: $0.
- External requests / new images / credentials / production access: 0.
- Technical value: Potentially High, still inferred.
- Current access posture: Observable but unauthorized for a live ceiling test;
  downstream rights unclear.
- Evidence decision: **Revise.**
- Access action: **Pursue permission or obtain a separate founder boundary
  decision; do not run more stored-only analysis.**

The numeric finish line did not move. Cycle 7 did move the decision boundary:
the no-cost stored path is exhausted, and the exact next Management evidence
requires a human access decision rather than more parser or schema work.

## Exact Cycle 8 Selection

Select DL-012's controller-authorized Tattle schema/rights/yield gate as the
only complementary Customer-side evidence currently capable of changing the
portfolio decision. It is not started and DataLab is not authorized to contact
Tattle.

If Kyle authorizes human contact, Cycle 8 first requires one redacted
photo/export schema and applicable rights packet. Only if that passes may the
same bounded cycle evaluate aggregate counts for at least 1,000 already-sent,
lawfully consented prompts plus 35 blinded historical photo records from at
least 10 locations, including multi-item orders. DataLab sends no SMS, receives
no names/contact/payment/free-text/device data, uses no production system, and
incurs no cost without separate approval.

Stop Cycle 8 on missing exact photo-to-order-line binding, export support,
controller authority, Customer rights, deletion propagation, 35 auditable
records, at least 95% point precision, the required Wilson bound, or credible
national unique-location economics. If authorization or a qualifying packet is
not available, skip Cycle 8 execution and proceed to the Cycle 9 final
portfolio synthesis.
