# Source Registry

This is a decision index, not a substitute for `DECISIONS.md` or
`ACQUISITION_MAP.md`. Results below are historical/code-state evidence until
DL-001 produces a DataLab baseline.

Access posture and technical value are separate. `Unknown`, `Partner-only`, or
`Custom permission required` must not be treated as technical rejection. See
`ACCESS_OPPORTUNITY_POLICY.md`.

| Source family / path | Existing evidence | Technical value | Current access posture | Evidence decision | Access action | Next evidence required |
|---|---|---|---|---|---|---|
| Google Places identity | Primary production identity path; no committed identity precision audit | High, inferred | Open/Public API with quota and usage constraints | Re-measure | Test now only within an approved quota budget | Incremental identities, duplicate/merge precision, quota per accepted location |
| OpenStreetMap identity | Nominatim/Overpass plus <=175 m name-overlap matcher exists | Medium, inferred | Open/Public under documented service and data constraints | Re-measure | Test now with bounded local snapshots | Independent match precision and incremental census identities |
| Overture identity/websites | California GeoJSONL importer exists; no committed precision result | Medium, inferred | Open/Public licensed snapshot | Re-measure | Test now by local replay | Incremental identities/sites and merge precision |
| Google photos/reviews | Primary live Customer/owner-candidate path; provider cap and pipeline fixes documented | High, inferred | Open/Public API with quota; downstream author/usage evidence incomplete | Quarantine north-star claims | Test now only after quota approval | Useful-photo yield, author precision, strong item-match precision, permitted retention/display |
| Gemini naming/OCR | Batched analysis, quality, duplicate detection, and menu OCR | High, inferred | Commercial service already used by product; new calls consume quota | Quarantine as benchmark truth | Test now only with stored responses or approved quota | Blind item-match, duplicate, and provenance audit |
| Restaurant websites/schema.org | Up to 10 linked pages, menu/schema/assets; Bluewater historically improved 6 to 13 photos | High, inferred | Mixed Open/Public and Terms/rights unclear by site | Re-measure | Test now only on documented bounded paths; pursue permission where needed | Incremental strong Management matches, rights evidence, freshness, failure rate |
| Common Crawl | Archive lookup/backfill exists; no committed incremental result | Medium, unknown | Open/Public dataset with source-site rights still relevant | Candidate | Test now by bounded local replay | Freshness, rights posture, and incremental menu/Management-photo coverage |
| Menufy/HungerRush | Direct API, link follower, rendered fallback; Richie's historically returned 221 items | High, inferred | Publicly observable path; terms/authorization posture requires review | Re-measure, do not reinvent | Test now only if bounded path is authorized; otherwise pursue permission | Current hit rate, image yield, provenance, repeatability, controller position |
| DoorDash public surfaces | State sitemap plus Camoufox/RSC parsers; small CA discovery check 4/5; format bugs fixed | High, inferred | Mixed Open/Public discovery and Terms/rights unclear store extraction | Re-measure carefully | Separate safe discovery probe from permission-gated content validation | URL identity precision, item/photo yield, rights posture, repeat run, incremental comparisons |
| DoorDash partner/data route | No SeeFood agreement documented | Potentially High, unknown | Partner-only or Custom permission required | Candidate opportunity | Pursue permission if public research supports unique value | Controller, available fields/rights, pilot eligibility, economics |
| Grubhub current crawler path | 270 runs produced zero items/photos; registry paused | Low on proven path | Publicly observable but unproductive; broader rights unclear | Reject until material change | Monitor | Cited platform or access change before any new probe |
| Grubhub partner/data route | No SeeFood agreement documented | Unknown | Partner-only or Custom permission required | Unproven opportunity | Monitor pending evidence | Whether an item/photo/provenance feed exists and who can authorize a pilot |
| Toast public/merchant paths | Real links observed; direct access historically blocked/expensive | Potentially High, inferred | Mixed Merchant-authorized, Partner-only, and Observable but unauthorized paths | Candidate | Pursue permission; stored replay may be testable now | Exact sanctioned path, item-image linkage, pilot eligibility, value estimate |
| Square/ChowNow/Clover/Olo/Popmenu | Detection and generic extraction exist; tested extraction unproven | Potentially High, unknown by provider | Mixed Merchant-authorized, Partner-only, Open/Public, and Unknown | Candidate family | Research each path; test or pursue permission separately | One provider/path at a time, public evidence, then 12-restaurant authorized probe |
| BentoBox/Owner/SpotHopper/Slice/Flipdish/Lightspeed/GloriaFood | Detection registered; no source-specific live result | Potentially High, unknown by provider | Unknown; likely mixed public, merchant, partner, and internal paths | Highest discovery gap | Research now; do not reject restricted high-value paths | Opportunity matrix plus safe probe or exact permission ask |
| Review/photo networks and commercial licensors | No current source-specific inventory beyond Google/Yelp history | Potentially High for Customer supply | Unknown, likely Commercial license, Partner-only, or Custom permission required | Research gap | Pursue permission/deal for strong item-linked candidates | Controller, author/item evidence, license rights, pilot size, economics |
| Brand templates | Exact-name memberships and inherited menus implemented; membership unconfirmed by default | High location leverage, inferred | Internal SeeFood method using mixed-source evidence | Quarantine location claims | Test now on local evidence | Membership precision and location-availability audit |
| Management menu capture | OCR capture, human review, publish workflow exists | High strategic fallback | Merchant-authorized first-party | Strategic fallback | Test now only with read-only/local evidence; product trial belongs to main thread | Conversion, confirmation accuracy, comparison dishes created |
| Merchant provider APIs/exports | Google Business, Square, Toast, Clover scaffolding; no live import | Potentially High | Merchant-authorized, Partner-only, or Custom permission required | Candidate | Pursue merchant/platform permission by path | Scopes, partner access, cost, item-image linkage, refresh burden |
| Merchant social import | Consent-first design exists only in backlog | Potentially Medium to High | Merchant-authorized plus platform approval; other paths may be Partner-only | Research gap | Pursue permission for a deliberate-selection pilot | Exact provider access, rights/provenance, item-match workflow, platform review |
| Customer contributions | Working upload and missing-dish routes; no conversion baseline | High strategic moat | First-party user-authorized | Strategic moat | Test now with read-only aggregate evidence; product changes belong to main thread | Conversion and verified comparison coverage |

Every retained source must eventually record access method, sample size,
incremental coverage, provenance, item-match quality, repeatability, cost,
failure rate, refresh path, Keep/Revise/Reject/Quarantine evidence decision, and
separate access action. Permission-gated potential never counts as present
coverage.
