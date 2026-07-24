# DataLab Status

## Verdict

**Promising but unproven**

## Current Phase

Gemini research triaged against primary sources; baseline measurement is next.

## Current Goal

Calibrate the existing comparison flag on 12 deterministic Temecula candidates,
then use an independent local identity/status frame to freeze the Temecula
census and evaluator-owned national holdout and measure the full existing stack
from a forced-read-only snapshot.

## Why This Comes First

Without a trustworthy starting measurement, the lab cannot tell whether an
experiment created useful new coverage or merely collected more raw data.

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
- Tripadvisor is self-service pay-as-you-go with up to two photos per location
  and 5,000 free calls per month after billing signup, not strictly a bespoke
  enterprise-only API.

The independently challenged queue now puts recovery of already-held Customer
photos and a read-only contribution-funnel audit ahead of new Management
connectors. Square has a bounded schema-fixture experiment, and every retained
High-value permission path has a complete evidence-gated brief. No coverage
improvement is claimed.

## Confidence

High for the corrected API/access facts that have direct primary-source
support. Medium for the opportunity ranking. Low for expected incremental
comparison coverage because Gemini supplied no usable sample measurements and
the DataLab baseline is still unknown.

## Cost

$0. Primary-source documentation was read. No production reads or writes,
provider API calls, model calls, account creation, vendor contact, crawls, or
paid quota were used.

## Production Impact

None. The lab is prohibited from production writes, deploys, and automatic
merges.

## Next Action

Run DL-001 on one 12-restaurant, 120-photo-maximum sanitized local evidence
bundle. The Benchmark Guardian compares current SQL claims with the
strong-match definition to expose failure mechanisms, not estimate a population
error rate. No live photo or source fetch is allowed.

## Kyle Needs To Do

Nothing. The Gemini result has been received and triaged.
