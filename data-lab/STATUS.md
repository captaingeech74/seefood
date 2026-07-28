# DataLab Status

## Verdict

**Promising but unproven**

## Current Phase

DL-007 Stage 4 independently verified a clean read-only bundle of 5,048 dish
rows, 4,004 claimed behavioral candidates across 57 restaurants, zero gold
candidates, and zero real attempts or receipts. The treatment remains disabled.
The candidate decline from Stage 3's 4,036/58 is snapshot drift, not a measured
loss of production coverage.

The 100-image packet was reviewed without labels and the judgments were frozen
before unblinding. After names and descriptions were revealed, all 100 images
were exact or strong matches to the item being sold. The 95% Wilson interval is
96.30%–100%. This is strong selected-packet evidence for Management
item-to-image alignment, but it comes from 43 restaurants in one Pacific
development market and is not national yield evidence.

Stage 4 materially fixed one-shot terminal review, exact stored Customer
consent, full upload-attempt binding, and first-outcome receipt immutability.
It did not establish one canonical measurement contract. The exporter,
runtime prompt route, and database gold function still use different gates and
can select or grade different photos. Runtime does not prove the latest
successful source snapshot. Independent Management rights review and strict
entity/source lineage are also missing.

The 54-row same-snapshot ledger proves selector choices changed, but it does
not reproduce the historical 4,876-to-4,882 population correction because it
omits old/new pass states. The behavioral/prior-rights intersection also
drifted from 3,912 to 3,881 without a stable row bridge. Fixture-test labels
overstate the actual assertions, and failed-attempt retries conflict with
immutable first receipts.

DL-007 remains `Revise`. Push 5 is the fifth and final push in the authorized
loop. It must create one server-owned behavioral/gold contract consumed
unchanged by exporter, runtime, and terminal review, prove it with an
adversarial isolated test matrix, and preserve treatment-off status. No
conversion or verified coverage improved.

DL-007 Stage 3 independently verified 5,048 dish rows and 4,036 behavioral
prompt candidates across 58 restaurants, but zero gold comparison candidates,
attempts, receipts, or coverage improvement. The bundle and all 100 evidence
images passed integrity and metadata checks. The treatment remains disabled.

The corrected all-attached-photo ranking reports 4,882 rows failing only the
prior stored rights gate, six more than Stage 2's top-photo-first 4,876. This is
a 0.12% selection correction, not new data or coverage. The exact six rows
cannot be reconciled across the two bundles because their snapshots, opaque
seeds, and ordering salts differ.

The blind packet contains 100 images across 47 restaurants: 94 DoorDash, four
Grubhub, and two Schema.org. Ninety-nine plausibly depict orderable food or
drink; one is plainly packaged cutlery. The packet withholds expected dish
labels, so exact/strong item matching is unauditable. Management provenance,
display rights, and independent near-duplicate review remain unverified for
every row. The packet is heavily DoorDash-weighted and not a representative
national evaluation.

Stage 3 fixed upload attempt-to-dish binding, separated behavioral and gold
targets, preserved display-only consent, added cancellation/failure stages,
kept receipts from overwriting identical outcomes, and added an atomic review
function. Activation still fails: terminal review uses a weaker Management
predicate than the gold contract, can re-review a rejection into approval, can
backfill missing consent scope, permits contradictory review outcomes, and can
emit a claimed comparison without proving two distinct gold-qualified images.
Traffic classification is not yet a trustworthy non-team denominator.

DL-007 remains `Revise`. Push 4 must make terminal comparison creation use one
canonical gold predicate, enforce a one-shot state machine and full receipt
binding, and provide a same-snapshot selection ledger plus a label-and-image
audit drawn from the behavioral intersection. No conversion or coverage
improved.

DL-007 Stage 2 previously independently verified the passive known-dish
measurement and submission foundation deployed by the main thread. The
sanitized bundle passed all integrity checks. New known-dish submissions now
carry a stable menu-item field, UUID attempt, versioned display consent, server
receipts, and pending/inactive/nonpublic review state. The treatment remains
disabled.

The target roster contains 5,048 mechanically selected dish candidates across
69 restaurants but zero qualified targets. Every candidate fails the stored
Management-rights gate. Exactly 4,876 candidates across 67 restaurants fail
only that recorded gate under the exporter's other database tests. This is a
large possible inventory, not verified prompt eligibility or coverage: menu
freshness/orderability, Management provenance, duplicate review, and the chosen
photo were not independently evidenced, and no images were supplied.

Activation remains unsafe. Upload replay does not enforce the attempt's
original restaurant/menu-item binding; `eligible_prompt_impression` does not
require a qualified target; staff exclusion remains unverified; several
failure/cancellation receipts are incomplete; receipt upserts can overwrite
their first observation; and no implemented review transition can record a
completed verified comparison. The consent text is display-scoped and must not
be represented as broader derivative or model rights.

DL-007 remains `Revise`. Push 3 must harden these mechanics, separate
behavioral-prompt candidates from gold comparison candidates, and provide a
blind bounded evidence audit of at most 100 rights-only candidates. No
conversion or coverage improved.

DL-007 Stage 1 previously completed the first-party contribution-funnel audit.
The sanitized read-only bundle passed all integrity and redaction checks, but
it found zero creditable real Customer-photo contributions and zero restaurants
improved. Its four stored Customer-classified photos were all test fixtures
with unreviewed rights.

The supplied 89 target entities exactly reproduce the mechanical formula
`current menu + Management-classified photo + no verified first-party Customer
photo`. They are not yet 89 restaurants one photo away from a verified
comparison: the bundle lacks dish-level exact/strong attachment, accessible
useful image evidence, reviewed Management provenance and rights, duplicate
clearance, menu freshness/orderability, and restaurant operating eligibility.

The traffic aggregate cannot be interpreted as user conversion. One known
fixture entity produced 29 of 38 app opens and 40 of 106 total events. Removing
only that fixture leaves at most nine app-open rows, three visitor tokens, and
eleven sessions; other ineligible traffic cannot be excluded from the supplied
event rows. Prompt impressions, opens, starts, failures, cancellations, and
authoritative upload results are not instrumented. Zero observed uploads is
therefore not a measured 0% conversion rate.

DL-007 remains the active experiment with a `Revise` Stage 1 decision. Stage 2
must produce a qualified dish-level target roster, fixture-free event
denominators, and complete privacy-safe funnel instrumentation before a bounded
real prompt test begins. No coverage improved.

DL-013 previously completed the first post-baseline technical qualification. It found that
DoorDash's standard APIs are not a current national acquisition connector while
preserving both a bespoke-data opportunity and a separate scraping hypothesis.
DoorDash has the right data shape and credible national geography, but its
standard APIs do not provide SeeFood a marketplace-wide read path. Required
downstream rights and representative image yield remain private. No coverage
improved.

Official DoorDash documentation confirms authenticated active-menu JSON with
documented menu/category/item identifiers and an item-level
`original_image_url` field. Identifier stability and image population were not
measured.
DL-013's single bounded read of the public store-sitemap index found entries
for all 50 states, DC, and Puerto Rico. Combined with DL-002's 168/168 exact
selected DoorDash item matches and 164 useful images, technical potential is
High.

The standard path is not SeeFood's path. Marketplace GET Menu is limited to
stores onboarded or configured to the active provider; Storefront reads are
business/store scoped. DoorDash says Marketplace access is approval-only and
the integration pipeline is currently at capacity. Published terms do not
grant SeeFood marketplace-wide retention, display, derived matching,
cross-source combination, or deletion rights.

The standard-API failure does not reject scraping. National discovery is
visible, the RSC parser has worked, and selected-record item linkage was
excellent. A reliable scraping system could theoretically produce a
game-changing menu and strong-photo upgrade. Its national store-match,
rendered-fetch, image-population, refresh, duplicate/ghost/retail filtering,
source-provenance, and machine-cost rates remain unmeasured. The current
DataLab boundary does not authorize defeating bot controls, so live scaling
requires a separate decision or written consent.

The frozen Temecula development cohort contains 396 independently reviewed
active provider identities. It excludes 241 unknown-status identities and one
unresolved active co-location; one confirmed closure is kept separately. The
county permit challenge does not enlarge the cohort: among 100 frozen review
records, 48 were likely genuine provider omissions/status candidates, 20 were
already provider-represented, eight were likely ineligible, and 24 remained
unresolved.

The active content denominator is 504: 396 Temecula plus 108 hidden national
restaurants. Twelve national closure/move/replacement sentinels are separate.
The exporter incorrectly used 516; DataLab corrected the denominator without
unblinding the holdout. Sentinel accuracy is not assessable because Stage 2
omitted their status evidence.

Founder priority correction: website strength, exact cuisine balance,
food-truck/nontraditional subtypes, ghost-kitchen classification, and restaurant
opening date/recency are optional context, not benchmark quotas or stop
conditions. The benchmark and DL-002 handoff now apply that rule to every
worker and reviewer.

The corrected claimed ladder is 150 restaurants with at least one stored
useful-photo signal, 84 with a current menu, 64 with seven current-menu
attachment candidates, 60 meeting the 20% attachment threshold, 46 meeting the
50% threshold, and six restaurants containing 21 claimed comparison dishes.
The Guardian verified zero comparison dishes. All 45 Customer references used
by those claims were unavailable, Customer provenance was unverified, and all
73 claim-photo rights statuses were unreviewed.

Across 214 rendered catalog-source evidence photos, 175 item matches passed and
39 failed: 81.78% precision with a 95% Wilson interval of 76.06%–86.37%, below
the 95% promotion gate. All 214 were classified as Management from their source
path, but original merchant/POS/controller authorship and rights were not
verified. The national active holdout had zero production matches and therefore
zero claimed content coverage beyond identity.

The pooled score hides an important source split. DoorDash supplied 168/168
exact item matches and 164 useful catalog-source images in this selected
evidence packet. Schema.org supplied only 7 exact matches, 39 rejects, and 6
unverifiable records. This does not measure DoorDash's national location yield
or establish original authorship or usage rights, but it raises the technical
potential of both authorized and scraping paths materially.

On founder instruction, Benchmark Specification 0.2 now allows bounded image
reads from public or already-authorized recorded locators. The 214 Stage 2
reads are valid audit evidence. Authentication bypass, rate-limit evasion,
unbounded crawling, material paid quota, PII collection, and production writes
remain prohibited.

## Current Goal

Decide whether the combined Management-data and Customer-photo opportunity can
materially transform SeeFood's national data coverage. Temecula is the
development and validation market, not the scope of the value case.

## Why The Program Continues

Transformative menu and Management-photo coverage is valuable on its own.
DL-DR-002 also found a credible national Customer-photo collection partner
class. The evidence is strong enough to justify the bounded DataLab measurement
program, but not an integration, vendor commitment, or claim of game-changing
coverage.

## Last Verified Result

DL-000 completed the static inventory. It found no valid DataLab baseline:

- the legacy 25-restaurant set is not a Temecula census;
- its stored results contain no Management-versus-Customer metric;
- its harness calls a production route that persists on cache misses; and
- the production coverage SQL treats canonicalized AI labels as matched, which
  is weaker than the DataLab strong-match definition.

No coverage improvement is claimed. The existing code, source history, and
stored results are reusable inputs after the measurement defects are removed.

DL-DR-001 then checked the citation-free Gemini response against current
first-party documentation:

- Google Business Profile, Square, Toast, Flipdish, GloriaFood, Overture, Slice,
  Tripadvisor, and parts of Lightspeed/Clover/Yext are real documented
  capabilities, but none has measured SeeFood comparison coverage.
- Square and Flipdish clearly document item-linked Management images.
- Google Business Profile documents item-level `mediaKeys`; actual merchant
  population remains unknown.
- Toast V3 is ordering-partner-only. Slice documents a partner shop/menu API,
  but not the photo and fractional-modifier details Gemini claimed.
- Clover's documented inventory item schema does not expose images. Yext's
  documented review objects do not expose Customer photos.
- Riverside County publishes inspection search and 60-day closure/downgrade
  lists, but Gemini did not prove a complete bulk census frame.
- Oracle's official GloriaFood end-of-service date is March 31, 2027, more
  precise than the report's repeated April 2027 wording.
- A later official-documentation check found that Tripadvisor's newer Terra
  platform describes restaurant reviews with photos, review text, and reviewer
  details. Legacy partner feeds also document captions and review IDs. The
  earlier two-photo Content API result is not dispositive for Terra; current
  restaurant depth, field parity, rights, tiers, price, and national yield
  remain unverified. Published Master Terms currently appear incompatible with
  SeeFood's matching and paired-display use unless a negotiated Order grants
  explicit exceptions.

DL-DR-002 then tested Gemini's transaction-triggered Customer-photo thesis:

- Tattle currently documents transaction-triggered surveys, item-level
  feedback, optional meal-photo uploads, API access, 34+ named integrations,
  250+ brands, and a claimed 15,000+ locations. This is a materially stronger
  lead than a generic survey vendor.
- Tattle's public evidence links a meal photo to a survey, visit, and
  transaction context, but not to one exact order line. Its public documents
  also do not establish a photo export schema or SeeFood's right to retain,
  pair, label, display, sublicense, or train on the restaurant-controlled
  submissions.
- Ovation currently documents 50+ SMS integrations and order-triggered,
  item-specific survey questions. It does not publicly document a meal-photo
  upload, external photo export, exact order-line schema, reusable rights, or
  its exact active location footprint.
- Tripadvisor remains technically interesting but unusable under its published
  default terms for SeeFood's paired-display and matching use. Round Two found
  no new evidence that changes that gate.
- Gemini's low/base/high arithmetic produces 1,200 / 14,175 / 111,562.5
  expected raw upload attempts, not comparison-ready restaurants. The maximum
  distinct restaurants in those 1,000-location scenarios is only 500 / 700 /
  850, and
  actual accepted coverage must also survive rights, usefulness, exact-item,
  Management-counterpart, and duplicate gates.
- A POS order line does not prove that an uploaded photo depicts that item.
  The claimed 100% precision is rejected.

The corrected conclusion is `Proceed with bounded validation`, not `build the
integration`. The opportunity could double a small comparison-ready baseline,
and Tattle's current footprint makes national relevance credible. It has not
yet proved the fixed national game-changer gate because the SeeFood baseline,
photo-upload yield, exact-item yield, Management-photo overlap, rights, export
path, and distinct-location distribution are all unknown.

No third Gemini query is queued. The remaining decisive questions require
measured SeeFood evidence or a controller-supplied schema/rights packet, not
another public-web synthesis. No coverage improvement is claimed.

DL-001 then attempted the 12-restaurant calibration:

- the three committed benchmark results contain only aggregate restaurant
  counts and latency;
- no local export contains photo IDs, dish keys, author classes, current-menu
  timestamps, comparison flags, image evidence, or duplicate hashes;
- `menu_matched_count` is an API label count, not proof of a
  Management-versus-Customer comparison;
- no database credential or forced read-only connection exists in this
  worktree; and
- the four claimed-comparison, four rich-unpaired, and four sparse buckets
  therefore cannot be formed without inventing labels or obtaining new data.

The independent Benchmark Guardian confirmed that both explicit DL-001 stop
conditions are met. The SQL remains worth testing: it can derive authors
heuristically and credit shared menu/canonical keys without checking every
DataLab gold requirement. But no precision, error, or coverage conclusion can
be drawn without the underlying evidence.

`DL001_INPUT_HANDOFF.md` now defines the bounded, sanitized,
transaction-read-only export the main SeeFood thread can provide without
exposing credentials or personal data. DL-001 remains untested rather than
rejected.

On July 27, the main thread supplied a bounded ignored bundle and DL-001
resumed. The bundle itself was read-only and stayed inside the safety limits:

- one `REPEATABLE READ READ ONLY` transaction ending in `ROLLBACK`;
- 183 candidate rows, 12 selected restaurants, 980 menu rows, and 82 local
  WebP evidence images;
- all manifest hashes passed, all 82 images decoded, no EXIF/XMP/ICC metadata
  chunks were present, and no obvious credential, token, email, or forbidden
  personal-data field was found;
- the 12 restaurants were exactly the lowest seeded ranks in the supplied
  four-claimed, four-rich-unpaired, and four-sparse buckets.

The bundle nevertheless failed acceptance:

- its claimed-comparison query scopes, groups, and pairs by
  `restaurant_id`, while the production `coverage_v2_metrics` function at the
  supplied commit scopes entities, includes all restaurants belonging to each
  entity, and groups comparisons by `entity_id`;
- `G01`–`G04`, `G05`–`G08`, and `G09`–`G12` preserve the bucket order, so the
  supposedly blind packet reveals all three buckets;
- no deterministic rule or complete candidate roster proves how a claimed dish
  and the remaining photos were selected;
- the redaction log says `passed` while its own environment-secret scan remains
  `run_before_completion`; and
- stored `comparison_ready` rows are historical signals, not current V2
  comparison-dish claims, and some exported stored signals have no active dish
  key.

The independent Guardian completed an exploratory review of all 12 restaurants
and 82 images before the packet was rejected. It found four same-key candidate
dishes, five Management/Customer pair combinations, and zero pairs satisfying
all supplied gold evidence. One soup Customer image was only a weak item match;
one claimed Customer image was a cropped/re-encoded copy of the Management
image; every author classification was heuristic; every rights status was
`unreviewed`; and no record carried affirmative operating-status evidence.
These are concrete failure examples, not a production precision estimate.

No verified coverage changed. DL-001 remains `Quarantine / untested` against
the actual production V2 signal.

The main thread then supplied a corrected entity-level bundle. Independent
validation confirmed:

- exact parity with the installed production function for all seven exported
  coverage fields, including six SQL-claimed comparison entities;
- 1,390 entity candidates, exact seeded ranks, and the four lowest-ranked
  claimed plus four lowest-ranked rich-unpaired entities;
- complete deterministic claimed-dish and photo rosters;
- 924 current-menu evidence rows and 78 locally available photo renders;
- current V2 claims separated from eight historical stored-flag signals; and
- a genuinely shuffled blind packet with passing hashes, redaction checks, and
  no delivered unblinding material.

A fresh Benchmark Guardian with no exposure to the rejected packet audited all
12 opaque records and all 78 images before the Lead joined records by unique
public name and coordinates.

The four sampled current V2 claim dishes all failed the DataLab comparison
definition:

- three of four were visually distinct, strongly item-matched candidate
  comparisons, but none had verified Customer provenance or reviewed rights;
- the fourth used a crop/re-encode of the same underlying image on the
  Management and Customer sides;
- zero of 22 stored Customer author labels could be verified from the supplied
  evidence; all were legacy Google-user heuristics;
- all 56 Management labels were supported by management-controlled catalog or
  first-party source evidence;
- 51 of 78 images were exact or strong item matches, while 20 were rejected;
- 71 of 78 were useful food images; seven contradicted their stored
  useful/orderable state; and
- the four rich-unpaired controls contained no missed strong comparison.

Therefore production `comparisonCoverage = 6` remains a **claimed** count, not
six verified comparison-ready entities. The deterministic four-claim sample
verified 0/4, with a 95% Wilson interval of 0%–49%; this is a mechanism warning,
not a population estimate and not proof that the other two claims fail.

One protocol defect remains outside the core claim calibration. The corrected
export ranked 1,207 identity-only entities with `entity-{internal UUID}` because
they had no legacy or attached restaurant place ID. That fallback was not
registered in `DL001_INPUT_HANDOFF.md`, and three of four sparse controls used
it. One was a place identity for “Murrieta,” not a restaurant; two others could
not be established as active restaurant locations. Sparse-control conclusions
are quarantined. Internal entity UUIDs are now prohibited as cohort rank IDs.

DL-001 closes as **Revise / mechanism confirmed**. It proves the SQL signal
omits decisive provenance, rights, usefulness, and duplicate gates. It does not
establish a complete Temecula baseline or improve coverage.

DL-002 preparation then froze the January 1, 2025 Census incorporated-place
boundary and a bounded Riverside County permit candidate/status frame. The
county snapshot contains 822 active permit rows / 808 unique establishment IDs
inside the polygon. Seventy-five home-based rows are withheld; 747 rows / 733
establishment IDs remain for internal reconciliation. These are not restaurant
or coverage counts. The layer includes multiple permits per establishment and
many non-restaurant facility types.

DL-002 then completed both handoff stages. Stage 2 matched every registered
cohort hash without exposing a national identity, reproduced the production
metric exactly for 393 mapped Temecula entities, and supplied 320 bounded photo
records. DataLab corrected two exporter errors:

- the active denominator is 504, not 516, because 12 national closure
  sentinels are scored separately; and
- the benchmark's useful-photo rung is at least one useful photo, while the
  exporter reported a seven-photo product threshold.

The corrected claimed ladder is:

- identified: 504/504;
- at least one stored useful-photo signal: 150/504;
- known current menu: 84/504;
- seven current-menu attachment candidates: 64/504;
- 20% current-menu attachment candidates: 60/504;
- 50% current-menu attachment candidates: 46/504; and
- claimed comparison-ready: 6/504 restaurants containing 21 dishes.

The Benchmark Guardian verified 0/21 comparison dishes. It retained all 21 as
unverifiable because every Customer reference was unavailable. The Adversarial
Verifier independently identified six of those as duplicate-reject candidates
from stored cross-author perceptual hashes and left 15 unverifiable. Both
evaluators agree the verified comparison-ready baseline is zero.

The Guardian inspected all 214 rendered catalog-source records: 175 exact item
matches, 39 rejects, and 171 useful nonduplicate food images. All 214 were
classified as Management from their source path, but original
merchant/POS/controller authorship was not verified. Item-match precision was
81.78% with a 76.06%–86.37% Wilson interval, below the promotion gate. All 100
declared Customer evidence records were unavailable, and all 320 rights
statuses were unreviewed. The 25 rich-unpaired controls produced no verified
false negative; 17 were unverifiable and eight had no Customer candidate. No
national controls existed because no national selected record matched
production.

Source-separated results were sharply different: DoorDash passed 168/168 item
matches and 164/168 usefulness checks; schema.org passed 7/46 rendered item
matches and 7/46 usefulness checks. The evidence packet was selected for
claims and rich controls, not for estimating source coverage. DoorDash item
quality is therefore real in the packet, while original authorship, national
yield, and rights remain unmeasured.

DL-002 closes as **Revise / baseline established**. It found large whitespace,
not a coverage improvement.

DL-013 then tested DoorDash's documentary and technical gate. Official
documentation and one bounded sitemap-index request established a documented
item-linkage schema, an image field, and nationwide geography. They did not establish
a marketplace-wide SeeFood read path, current partner availability, usable
retention/display/combination rights, representative image-populated restaurant
yield, refresh/deletion terms, or economics. It closes as **Reject as a current
standard connector / preserve bespoke and scraping opportunities**. Verified
coverage improvement remains zero.

## Confidence

High in the frozen cohorts, corrected baseline, zero verified comparisons, and
the selected DoorDash packet's item-match result. High that DoorDash's standard
documented APIs are scoped to configured merchants rather than a
marketplace-wide discovery feed. High that its geography is national. Low in
the actual fraction of US restaurants with current, approved item photos and
zero confidence in SeeFood's reuse rights until DoorDash supplies a written
grant. Status-sentinel accuracy remains unknown because Stage 2 omitted the
required status evidence.

## Cost

$0. DL-013 added one 13.9 KB public sitemap-index request and public
documentation review; it downloaded no images. Across the program there was no
production write, paid provider call, material paid quota, account, vendor
contact, unbounded crawl, deployment, infrastructure change, push, or merge.

## Production Impact

None. The lab is prohibited from production writes, deploys, and automatic
merges.

## Next Action

Run DL-007 next: a read-only audit of SeeFood's existing contribution funnel
and a paper experiment for targeted Management and Customer prompts. This is
the highest-value work that can proceed without vendor contact, credentials,
production changes, or a policy expansion.

Keep two DoorDash decisions separate from that work: whether to send the
prepared bespoke-data documentary request, and whether to authorize a bounded
live scraping feasibility test that encounters bot controls. Neither decision
should delay DL-007.

## Kyle Needs To Do

Nothing for DL-007. Later, decide separately on DoorDash outreach and the live
scraping-test boundary.
