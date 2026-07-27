# DataLab Status

## Verdict

**Promising but unproven**

## Current Phase

Baseline measurement resumes after completing the second pre-implementation
potential check.

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

## Confidence

High that Tattle has transaction-contextual item feedback and optional
Customer meal-photo collection, and that Ovation has order-targeted surveys.
Medium that Tattle is the best current partnership lead. Low for incremental
comparison coverage because exact photo-to-item linkage, rights-valid export
yield, and the SeeFood baseline remain unmeasured.

## Cost

$0. Primary-source documentation was read and three independent agents
challenged the source claims and model. No production reads or writes, provider
API calls, model calls, account creation, vendor contact, crawl, or paid quota
were used.

## Production Impact

None. The lab is prohibited from production writes, deploys, and automatic
merges.

## Next Action

Run DL-001, the 12-restaurant local calibration of the existing comparison
flags, using only a guaranteed read-only or already-sanitized evidence bundle.
This establishes which current claims are trustworthy before the Temecula
census and locked national holdout are frozen.

Retain Tattle as a high-priority permission-gated deal candidate. A later
controller packet must prove exact photo-to-order-line binding, exportability,
SeeFood-compatible rights, and real photo yield before any code or outreach
campaign is authorized.

## Kyle Needs To Do

Nothing.
