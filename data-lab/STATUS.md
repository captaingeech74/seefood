# DataLab Status

## Verdict

**Promising but unproven**

## Current Phase

Final pre-implementation potential check; Gemini Prompt 2 is ready for Kyle.

## Current Goal

Decide whether the combined Management-data and Customer-photo opportunity is
large enough to justify the full DataLab workload.

## Why This Comes First

Transformative menu and Management-photo coverage is valuable on its own. Kyle
hypothesizes that it can also attract contributors, but that cold-start effect
is unverified. Before beginning the large benchmark and connector program, Kyle
wants one harder search for a comparably transformative Customer-photo corpus
or acquisition channel.

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

Kyle runs Prompt 2 in `GEMINI_HANDOFF.md` and pastes the complete result back.
The Lead then verifies it, estimates the true combined upside, and gives Kyle a
plain go/no-go recommendation on the larger program. DL-001 remains the next
bounded measurement and starts only after Kyle's decision.

## Kyle Needs To Do

Run Gemini Prompt 2 and paste the complete output back into this task.
