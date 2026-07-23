# DataLab Status

## Verdict

**Promising but unproven**

## Current Phase

Discovery charter widened; benchmark specification remains complete and
baseline measurement is next.

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

The access-opportunity governance was revised after Kyle's direction. The lab
now rates technical value independently from current access. Partner-only,
licensed, custom-permission, and bespoke-deal sources remain in scope as
permission-gated opportunities. They still cannot be accessed or counted as
coverage until an authorized pilot is independently measured.

## Confidence

High for the inventory, benchmark defects, and the clarity of the revised
decision boundary. No confidence claim is made yet about current production
coverage or the value of any newly admitted restricted opportunity.

## Cost

$0. No production reads or writes, external source calls, model calls, crawls,
or paid quota were used.

## Production Impact

None. The lab is prohibited from production writes, deploys, and automatic
merges.

## Next Action

Run DL-001 on one 12-restaurant, 120-photo-maximum sanitized local evidence
bundle. The Benchmark Guardian compares current SQL claims with the
strong-match definition to expose failure mechanisms, not estimate a population
error rate. No live photo or source fetch is allowed.

## Kyle Needs To Do

Run the revised exact Gemini Deep Research prompt in `GEMINI_HANDOFF.md` and
paste the complete result back here. It now seeks safe-now sources and
high-value permission/deal candidates. No technical interpretation is needed.
