# Experiment Queue

DL-001 completed the core mechanism calibration. All four sampled production
V2 claim dishes failed at least one gold requirement, while no comparison was
missed in four rich-unpaired controls. The sparse stratum is quarantined
because three records used an unregistered internal entity-ID rank fallback.
DL-002 is next; no source experiment may bypass the baseline.

## Active Experiment

| ID | Question | Bound | Status |
|---|---|---|---|
| DL-002 | What is the real claimed-versus-verified baseline on frozen Temecula and national cohorts? | Temecula frame capped at 500 selectable restaurant candidates; 120-record Guardian-owned national holdout; read-only sanitized evidence | Next cycle; stable public/provider identity required for every selectable record |

| Rank | ID | Hypothesis | Bounded evidence | Expected value | Status |
|---|---|---|---|---|---|
| Complete | DL-001 | Current production V2 comparison claims can credit a pair that fails, or lacks evidence for, at least one DataLab gold requirement. | Deterministically selected entity-level claims and rich-unpaired controls; 78 local photos; fresh Guardian blind audit | Calibrates failure mechanisms before a full baseline; does not estimate a population error rate | Revise / mechanism confirmed: 0/4 sampled claims passed; sparse controls quarantined |
| 0 | DL-002 | A forced-read-only snapshot, an independent local identity/status frame, and frozen cohorts will reveal the real largest gap and separate claimed from verifiable comparisons. | Temecula union capped at 500 selectable restaurant candidates; qualify Riverside County DEH only if a stable, city-bounded $0 snapshot is documented; otherwise stop and do not call the search portal a census frame; 120-record Guardian-owned holdout; SELECT-only export | Required before source experiments | Next; prohibit internal entity UUIDs as rank IDs |
| 1 | DL-004 | Existing unmatched Customer/Unknown photos contain recoverable strong item matches using preserved menu evidence rather than label containment alone. | Maximum 100 existing photos; no new downloads until URLs and quota are approved; blind Guardian audit | Direct comparison-dish leverage against the bottleneck Gemini did not solve | Pending DL-002 |
| 2 | DL-007 | Targeted Management and Customer contribution prompts close the final comparison gap more cheaply than another automatic source. | Read-only first-party funnel audit and paper experiment using existing aggregate conversion evidence; no outreach, account creation, or production changes | Tests the Customer-supply frontier before adding more Management-only pipes | Pending DL-002 |
| 3 | DL-012 | A transaction-triggered Tattle partnership can export rights-valid Customer meal photos bound to exact order lines at nationally material unique-location yield. | Documentary gate first: controller-authorized redacted schema/rights packet; only if it passes, at least 1,000 aggregate already-delivered prompts plus 35 blinded historical photo records across at least 10 locations, including multi-item orders; no DataLab outreach or SMS | Highest-potential Customer channel found; Tattle claims 15,000+ locations and already has meal-photo upload, item context, and APIs, but exact binding, rights, and yield are unknown | Pending baseline and explicit main-thread authorization to approach controller |
| 4 | DL-008 | Tripadvisor Terra review-linked photos, captions or review text can produce strong Customer-to-menu matches at nationally meaningful scale. | Contract/schema review first; only if Kyle or the main thread separately authorizes access, analyze a supplied nationally stratified fixture capped at 30 restaurants and 150 review-photo records, including a Temecula validation slice; blind item/provenance audit; no overage | Potentially High Customer-photo corpus; published default terms currently block SeeFood's intended use | Quarantined unless a negotiated Order grants explicit rights; DataLab cannot start service |
| 5 | DL-003 | Flipdish's documented merchant-authorized menu path produces exact item-linked Management images and useful freshness signals beyond the frozen stack. | One access path; public docs and local schema fixture first; only with permission, 3 development merchants, one current menu each, maximum 30 item images; Guardian hidden holdout | Best evidenced newer provider path; Management-side leverage | Pending DL-002 and merchant permission |
| 6 | DL-009 | A time-limited GloriaFood merchant rescue preserves exact item-linked Management images before service ends on March 31, 2027. | Identify one consenting existing merchant through the main thread; one menu request or merchant export; no outreach by lab; no customer/order data; maximum 500 items | Urgent preservation opportunity, but Management-only | Pending DL-002 and merchant permission |
| 7 | DL-010 | Google Business Profile FoodMenus returns item-level `mediaKeys` often enough to justify an approved merchant connector. | Documentation/schema fixture first; only with API approval and merchant OAuth, 3 locations and maximum 100 menu items; no writes | High-quality Management linkage if merchants actually populate the field | Pending DL-002 and API/merchant permission |
| 8 | DL-011 | Square Catalog's documented `image_ids` and related objects translate cleanly into a SeeFood Management-item fixture. | Local synthetic schema fixture first; live step only after baseline, merchant OAuth, and separate authorization; 3 merchants, maximum 100 items and 30 images | De-risks a documented Management connector without implying real coverage | Pending DL-002; local fixture is authorized but must wait its turn |
| 9 | DL-005 | Confirmed chain templates can upgrade many locations without inventing location availability. | One chain; 10 geographically varied development locations; explicit exception audit | High location leverage | Pending DL-002 |
| 10 | DL-006 | Common Crawl or deeper first-party site extraction adds current menu and Management-photo coverage beyond the live website path. | Maximum 20 visible development restaurants and 5 archive records per domain | Long-tail leverage | Pending DL-002 |

The Lead may reorder this list only after recording the measured reason.
DL-DR-001 moved Customer-photo recovery and the read-only contribution audit
ahead of new Management connectors because the primary-source check found no
automatic external source with both strong Customer provenance and item
linkage. It also added a bounded Square fixture so documented capability is not
lost. DL-001 and DL-002 remain prerequisites for measuring real incremental
coverage.

## Completed Discovery Gate

| ID | Decision | Result |
|---|---|---|
| DL-DR-001 | Revise | Primary sources supported 8 useful capabilities, corrected or narrowed 8 claims, and left expected comparison coverage entirely unmeasured. |
| DL-DR-002 | Revise and continue | Tattle became a verified transaction-contextual meal-photo partnership lead, but exact item binding, export rights, yield, and national incremental coverage remain unproved. Gemini's photo-versus-restaurant unit error and 100% precision claim were rejected. |
| DL-001 | Revise / mechanism confirmed | The corrected bundle matched production V2 exactly. A fresh blind audit found 0/4 sampled claim dishes fully verified: three were content-valid but lacked Customer provenance and reviewed rights; one reused the same underlying image. No false negative was found in four rich-unpaired controls. Three sparse controls used an unregistered internal-ID fallback and are excluded from conclusions. |

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
