# Experiment Queue

Order after DL-000. Only one experiment may be active.

| Rank | ID | Hypothesis | Bounded evidence | Expected value | Status |
|---|---|---|---|---|---|
| 0 | DL-001 | Current SQL comparison flags can credit a pair that fails, or lacks evidence for, at least one DataLab gold requirement. | Deterministically selected 12 Temecula candidates: 4 claimed comparison-ready, 4 menu/photo-rich unpaired, 4 sparse; maximum 120 locally supplied photo/evidence records; Guardian blind audit; no source calls | Calibrates failure mechanisms before a full baseline; does not estimate a population error rate | Next |
| 1 | DL-002 | A forced-read-only snapshot, an independent local identity/status frame, and frozen cohorts will reveal the real largest gap and separate claimed from verifiable comparisons. | Temecula union capped at 500 candidates; one versioned $0 frame currently authorized for benchmark use; 120-record Guardian-owned holdout; SELECT-only export; all seven rungs and missing-evidence counts | Required before source experiments | Pending DL-001 and cited local-frame evidence |
| 2 | DL-003 | One newer ordering-provider path has high item-plus-Management-photo value, whether it is testable now or requires a permission/deal pilot. | One provider and one access path; public-evidence access classification first; if authorized, 12 development restaurants and maximum 10 pages each; otherwise no collection and one exact permission-gated validation/deal brief | High Management-photo leverage without discarding restricted paths | Pending DL-002 and Gemini evidence |
| 3 | DL-008 | One restricted Customer-photo or marketplace source is valuable enough to justify human negotiation. | Public evidence only; one source; controller, exact data/right ask, 25-restaurant pilot design, inferred upside model with assumptions, economics ceiling, and fallback; no contact or access by the lab | Tests whether a bespoke deal could change the comparison-photo frontier | Pending Gemini evidence and DL-002 baseline |
| 4 | DL-004 | Existing unmatched Customer/Unknown photos contain recoverable strong item matches using preserved menu evidence rather than label containment alone. | Maximum 100 existing photos; no new downloads until URLs and quota are approved; blind Guardian audit | Direct comparison-dish leverage | Pending DL-002 |
| 5 | DL-005 | Confirmed chain templates can upgrade many locations without inventing location availability. | One chain; 10 geographically varied development locations; explicit exception audit | High location leverage | Pending DL-002 |
| 6 | DL-006 | Common Crawl or deeper first-party site extraction adds current menu and Management-photo coverage beyond the live website path. | Maximum 20 visible development restaurants and 5 archive records per domain | Long-tail leverage | Pending DL-002 |
| 7 | DL-007 | Targeted Management and Customer contribution prompts close the final comparison gap more cheaply than another automatic source. | Paper funnel and existing aggregate conversion evidence first; no outreach or production changes | Defines the automatic-data frontier | Pending DL-002 |

The Lead may reorder this list only after recording the measured reason.
Gemini findings may cause DL-003 or DL-008 to move ahead of other source work,
but DL-001 and DL-002 remain prerequisites for measuring real incremental
coverage.

## DL-001 Stop Conditions

Stop without expanding scope if a verified read-only database transaction
cannot be guaranteed, a sanitized local evidence bundle is unavailable, more
than 12 restaurants or 120 photos would be required, any credential or personal
data would enter a committed file, or any app/source call would write or consume
paid quota.

Select within each bucket by ascending
`SHA-256("DL-001-CAL-2026-07-23" || stable_restaurant_id)`. For each claimed
comparison restaurant, include every photo attached to the claimed comparison
dish, then fill to 10 photos by the same stable hash order. For the other
restaurants, take up to 10 photos by stable hash order. Stop if a bucket has
fewer than four eligible restaurants or if required evidence is absent.

## DL-001 Success

Success is a reproducible mechanism-calibration result, not a population error
rate or a higher coverage number. Record whether any SQL-claimed pair fails or
lacks a gold requirement, every failure mechanism, independently verified
strong comparisons, false-negative candidates, author and item-match
disagreements, runtime, and $0 cost. If all four claimed pairs pass, the stated
hypothesis is rejected for this sample; do not generalize that result to the
full census. If safe local evidence is unavailable, stop rather than fetching
it live.
