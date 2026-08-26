# SeeFood Senior Lead Handoff

Updated August 3, 2026. This is the current operational snapshot for the active
general-development lead. It is intentionally concise; durable product and
architecture decisions belong in `DECISIONS.md` and the focused documents under
`docs/`.

## Product North Star

SeeFood helps a diner answer one immediate question: what does the food at this
restaurant actually look like? Its differentiator is menu-item-level visual
coverage and the ability to compare photos shared by Management with photos
shared by Customers. Customer photos contributed through SeeFood remain in the
Customer category and receive distinctive SeeFood attribution.

Temecula is the proof market. The rollout then expands through San Diego metro,
San Diego County, Los Angeles, other major California metros, the 50 largest US
MSAs, and finally all 387 MSAs.

## Current State

- Production: <https://seefood-rho.vercel.app>
- Repository: `/Users/ace/Documents/seefood/seefood`
- Production branch: `main`; a push to `main` triggers Vercel deployment.
- Baseline handoff commit for the current lead: `857242f`.
- Stack: Next.js 14 App Router, React 18, TypeScript, Tailwind CSS, Supabase
  Postgres, Cloudflare R2, Google Maps, Sharp, and Vitest.
- Verification baseline: 96 tests passing after the DataLab 1.0 production
  carry-forward.
- DoorDash and Grubhub are enabled automatic acquisition sources. DoorDash
  discovery is city-bounded and ambiguity-safe; Grubhub now supplies a
  delivery location, reads its current first-party menu responses, and
  byte-verifies every candidate photo before persistence.
- DL-001's aggregate-only input and its first restaurant-row-scoped bundle were
  correctly stopped. The main thread owns a forced-read-only, credential-free
  entity-scoped evidence exporter at `scripts/export-datalab-dl001.mjs`; its
  ignored output is the only production evidence the lab may consume for that
  experiment.
- Image bytes are stored in R2 and delivered by signed R2 redirects instead of
  streaming through Vercel. A custom R2 domain remains the intended end state.
- The corpus is persistent. It contains restaurant identity, menu, photo,
  provenance, acquisition, analytics, member, merchant, and management data.
  Do not treat this as the old stateless prototype.
- Active acquired photos now use exact image bytes, not changing source URLs,
  as their durable identity. Perceptual hashes are audit-only. All observed
  origins and menu-item associations remain in dedicated provenance tables.
- V2 coverage now reports independently verified comparisons separately from
  mechanically claimed comparisons. A comparison counts as verified only while
  its terminal review, Customer photo, menu evidence, entity, and qualifying
  Management counterpart all remain current.
- Source runs and snapshots retain compact attempt evidence: requested provider
  URL, response hash, failure stage, discovery counts, byte-verification counts,
  and the exact resulting snapshot. Raw provider page bodies are not retained.
- Restaurant/provider website photos follow a food-first rule: reject non-food,
  prominent-text, promotional, and duplicate images; keep genuine food. If the
  food is useful but the supplied dish label is doubtful, retain the photo while
  detaching that unsafe dish claim instead of throwing the image away.
- Product photo reads now require an active, orderable, non-quarantined row.
  Legacy generic Schema.org images are adaptively quarantined only when a
  restaurant already has seven positively identified photos; photo-poor
  candidates stay staged for review. The August 26 run quarantined 1,505 weak
  rows across 43 restaurants without losing a positively identified photo.
  See `docs/WEBSITE_ACQUISITION_V3.md`.
- Merchant ingestion has one provider-neutral reconciliation path for Google
  Business Profile, Square, Toast, Clover, and Flipdish payloads. Provider
  adapters normalize into the same provenance-preserving corpus pipeline.
- The national acquisition backbone is live in review mode on Overture release
  `2026-07-22.0`: 443 candidates inside Temecula's official city polygon and
  8,777 across San Diego Metro. Imports are versioned, idempotent, reversible,
  provenance-preserving, and ambiguity-safe. See
  `docs/NATIONAL_ACQUISITION_BACKBONE.md`.
- Website Acquisition V3 is the durable unified path. Direct HTTP escalates
  only when necessary through curl-cffi, Patchright public-network capture, and
  Scrapling; Crawl4AI is reserved for explicit deep discovery. Crawls and asset
  verification are separate durable queues, generic site imagery cannot consume
  dish-linked verification capacity, and two successful absence observations
  are required before known-good evidence becomes stale.
- V2 evidence remains valuable and merges idempotently into V3 rather than being
  discarded. The full union contains 5,560 unique entity/dish observations
  across 66 Temecula entities. The reviewed V3 publication added 542 genuinely
  new canonical dishes across nine existing restaurant pages and 249 photo rows
  representing 248 new exact image byte identities. It improved menu depth and
  visual richness, not first-menu breadth. See
  `docs/WEBSITE_ACQUISITION_V3.md`.
- PDF parsing uses embedded text first and a pluggable OCR layer. PaddleOCR-VL
  remains the local default; Baidu Unlimited-OCR is supported behind a separately
  hosted GPU endpoint, and Mistral OCR 4 is supported but paid calls remain off
  unless deliberately configured. Neither challenger becomes the default until
  it wins a SeeFood menu-PDF bakeoff.
- GPS-first restaurant selection is venue-neutral. A materially clearer nearest
  restaurant opens automatically; genuine uncertainty returns a short plausible
  choice set that opens immediately. Resorts, malls, airports, food halls, and
  shared addresses use the same confidence rule.
- Google restaurant discovery is isolated behind
  `GOOGLE_PLACES_DISCOVERY_ENABLED`. Its database guard fails closed at 60 calls
  per day and 1,800 per month. Production discovery is enabled with a private
  server key restricted to the legacy Places API. Google maps, photos, coverage
  tools, and live diagnostics remain separate and disabled.

## Read Order

1. `HANDOFF.md` for the live state and immediate assignment.
2. `DECISIONS.md` for authoritative product and architecture decisions.
3. The code and tests for actual current behavior.
4. Focused documents relevant to the task:
   - `docs/METRO_ROLLOUT.md`
   - `docs/MANAGEMENT_MENU_TOOLS.md`
   - `docs/CUSTOMER_INSIGHTS.md`
   - `docs/OWNER_DINER_BRIDGE.md`
   - `docs/DATA_ACQUISITION_BACKLOG.md`
   - `docs/INFRASTRUCTURE_OPTIONS_2026.md`
   - `docs/SEEFOOD_DATALAB.md`
5. `PRD.md` and `PRODUCT_REVIEW.md` for product framing and historical intent.

When documents disagree, prefer current code and tests, then this snapshot,
then the newest entry in `DECISIONS.md`. Treat older narrative documents as
history rather than runtime truth.

## Architecture Map

- Product routes and APIs: `src/app/`
- User-facing and management UI: `src/components/`
- Data, acquisition, image, geography, and analytics logic: `src/lib/`
- Acquisition and maintenance jobs: `scripts/` and `src/crawler/`
- Database migrations: `db/migrations/`
- Tests: `src/lib/__tests__/`
- Benchmark fixtures and results: `benchmark/`

Important product surfaces include the restaurant grid and reveal, the food map,
My SeeFood, Hookups, Management, Management Menu Tools, Customer Insights, and
the V1/V2 coverage dashboards.

The acquisition system combines multiple sources while retaining provenance.
Restaurant identity, menu-item identity, photo identity, photo attribution, and
menu-photo matching are separate concerns. Google and other sources remain
useful; no source should silently overwrite another source's evidence.

## Working Rules

- Inspect the worktree before editing. Preserve user changes and unrelated work.
- Before a major production change, create and push an appropriately named
  rollback tag or otherwise record an exact rollback commit.
- Never expose secrets or copy environment values into documentation or chat.
- Protect production data. Diagnose first, keep mutations scoped, and make
  cleanup operations idempotent and auditable.
- Keep fixes close to the responsible layer. Avoid hiding corrupt corpus data
  only in the UI unless presentation grouping is the correct product behavior.
- Run `npm test`, `npx tsc --noEmit`, and `npm run build` for meaningful changes.
  Verify affected flows in a browser at phone and desktop widths.
- Push to `main`, confirm the Vercel deployment is Ready, and spot-check
  production when the user asks to build or deploy.
- Explain outcomes to Kyle in plain language, including what changed, why it
  mattered, and any remaining limitation.

## Known Boundaries

- Management dashboards, Hookups, and some owner flows currently contain
  browser-persisted sample behavior for product validation. Do not mistake all
  visible UI for fully authenticated, server-backed account infrastructure.
- Management menu-page extraction depends on Gemini. The prepaid Gemini balance
  was depleted at the last check; the API now returns a clear 503 and the
  workflow retains a manual fallback. Do not obscure this as a generic failure.
- Authentication, verified merchant access, billing, and real promotion
  delivery/redemption still require production layers beyond the current sample.
- R2 custom-domain configuration is planned but not yet complete.

## DataLab 2.0 and the Archived Lab

DataLab 1.0 is closed and frozen at commit
`dd56efd62b0675054cb1b8dc1cbbc74625a57279`. Its useful conclusions are retained
in `docs/DATALAB_V1_ARCHIVE.md`, but its control files, governance model, and
experiment queue are not active requirements.

DataLab 2.0 is complete at isolated branch commit `9dcc691`. It selected a
SeeFood-owned, source-neutral identity graph seeded monthly by Overture, with
deterministic review gates and a bounded one-hop website menu collector. It
recommends negotiating sanctioned DoorDash access first and Grubhub second,
while dropping national delivery-browser automation and generic website-photo
scraping. See `docs/DATALAB_V2_FINAL.md` for measured denominators, production
gates, and the ranked backlog; `docs/SEEFOOD_DATALAB_V2.md` remains the archived
operating design.

The isolation rules below apply to the completed DataLab 2.0 record and to any
future acquisition lab spun out from it.

SeeFood DataLab is a bounded research project in its own Codex thread, branch,
and worktree. It may inspect the system but may not write production data,
deploy, alter infrastructure, push or merge `main`, start paid services, or run
unbounded crawls. Its findings become production work only after the main lead
reviews and deliberately integrates them. See `docs/SEEFOOD_DATALAB.md`.

Do not perform the general-development assignment in the DataLab worktree, and
do not redirect the main build around an unfinished DataLab experiment.

For production-backed experiments, generate a bounded sanitized bundle from the
normal `main` checkout and mirror only that ignored bundle into the lab's
`data-lab/raw/` path. Never copy credentials or grant live production access.
See `docs/DATALAB_READ_ONLY_EXPORT.md`.

Everything below this paragraph documents completed DataLab 1.0 work and is
retained only as historical context.

DL-001 bundles live locally in both checkouts at
`data-lab/raw/baseline/DL-001/`. The accepted contract requires exact
`coverage_v2_metrics` entity semantics, one candidate per entity, four entities
from each calibration bucket, deterministic complete photo rosters,
independently shuffled Guardian records, and completed per-file secret/PII
scans. The corrected bundle contains 1,390 entity candidates, exactly 4+4+4
selected entities, 924 current menu rows, and 78 rendered photo records. Exact
production-metric parity and all 196 manifest hashes pass. The rejected
restaurant-row-scoped bundle is retained locally under
`DL-001-invalid-restaurant-semantics-2026-07-27`; the DataLab branch and its
committed experiment files remain untouched.

DL-002 uses Overture Places and standardized Census geography for its scalable
national frame. Riverside County permits are only an independent Temecula
validation source; SeeFood will not build a county-by-county national
acquisition system. Founder direction on July 27 removed ghost-kitchen
classification and restaurant opening date/recency as hard requirements. They
are optional context and may never block a DataLab cohort, bundle, experiment,
or recommendation.

The same simplification applies to website-strength quotas, exact cuisine
quotas, and food-truck/nontraditional-venue quotas. DataLab may report them
when already supported, but the product does not need them to judge identity,
current coverage, comparisons, rights, safety, or national generalizability.
The main thread supplies sealed read-only Stage 1 inputs; DataLab performs
reconciliation and hidden cohort selection. Only then may the main thread
produce bounded Stage 2 evidence for Guardian-selected public-ID hashes.

DL-002 Stage 2 is now complete locally under
`data-lab/raw/baseline/DL-002/main-thread-stage2/` in both checkouts. The
exporter used only the registered 120 selected and 12 alternate public-ID
hashes; it did not open the clear national manifest. The 516-record evaluation
denominator contains 396 accepted Temecula identities and 120 hidden national
identities. Exactly 393 Temecula identities map one-to-one to production
entities; three remain identified but receive no duplicated production credit.
None of the hidden national hashes or alternates currently matches a production
provider identity.

The claimed baseline is 84 restaurants with a current menu, 138 with seven
food photos, 69 with seven menu-matched photos, 61 at the 20% menu-photo rung,
49 at the 50% rung, and six with at least one claimed comparison dish. The
packet contains all 21 claimed comparison dishes, 25 rich-unpaired controls,
320 evidence photo records, 214 metadata-stripped renders, and 106 unavailable
records explicitly marked unverifiable. These are claimed, not verified,
results; DataLab owns the blind evaluation. The first mechanically valid but
image-empty packet is retained under the ignored
`main-thread-stage2-invalid-no-rendered-images-2026-07-27` name.

DL-007's sanitized Stage 1 contribution-funnel bundle is complete locally under
`data-lab/raw/baseline/DL-007/main-thread-stage1/` in both checkouts. The fixed
snapshot contains 106 whitelisted event rows, four first-party contribution
photo rows, and 170 relevant non-test entity eligibility rows. All four photo
rows belong to a `test_fixture` entity and are explicitly excluded from real
funnel results. The real baseline is therefore 38 recorded visits from five
visitors, zero successful non-test contributions, and 89 entities with a
current menu plus a Management photo but no rights-verified first-party Customer
photo. Prompt impressions, prompt opens, upload starts, cancellations, and
failures were never instrumented and cannot be inferred. Production was not
changed or deployed.

DL-007 Stage 2 adds a separate, idempotent audit trail for the existing
known-current-dish “Add a Photo” surface. Every attempt is tied to a current
menu-item ID, session, experiment, and passive variant. New known-dish photos
carry an explicit versioned rights grant and remain inactive and unpublished
while moderation, exact/strong item matching, and near-duplicate review are
pending. The behavioral treatment prompt remains disabled. Historical
`app_events` are still upper-bound browser activity, not known people or
verified eligible traffic.

DL-007 Stage 3 hardens that passive path before any treatment. An attempt is
immutably bound to its original restaurant, current menu item, experiment,
variant, and surface. Receipt rows preserve first occurrences. Native picker
cancellation and server optimization, storage, post-storage target, record,
and publication outcomes are named stages. The atomic terminal review function
can publish a Customer photo only after display-scoped consent, moderation,
exact/strong item match, and duplicate review pass; it records a verified
comparison only when a separately qualified Management photo exists on the
same dish. Behavioral prompt candidates and gold comparison candidates are
separate classes, and the first class never counts as coverage.

DL-007 Stage 4 makes terminal review one-shot and makes its database predicate
the single definition of a verified comparison. Stored consent cannot be
repaired during review, contradictory terminal receipts cannot coexist, and a
Customer photo that duplicates the selected Management photo is rejected.
Management photos require separate provenance and usefulness review fields;
legacy rows default to unreviewed and therefore receive no automatic gold
credit. The review function is executable only by the service role. Public
traffic remains `public_unverified`, records a separate analysis-eligibility
state, and cannot be counted as verified behavioral traffic. The treatment
remains disabled.

DL-007 Push 5 removes the last parallel eligibility implementations. Database
functions now return the named behavioral gates, evaluate every attached
Management photo, select the highest-quality fully passing counterpart, and
return the exact gold decision used by runtime, terminal review, and the
read-only exporter. Management display rights have their own auditable review
state and all existing rows default to unreviewed. Server-screened public
traffic may be labeled `eligible_external` only after fixture, staff,
automation, and ineligible-entity exclusions; this does not claim proof of a
human. Failed attempts are terminal and the client uses a new attempt ID for a
retry. The treatment remains disabled.

DL-007 Cycle 6 corrects the independently discovered Stage 5 runtime mismatch:
the database returns `behavioral`, while the prior runtime read `behavior`.
Runtime and the read-only exporter now use the exact same pure adapter, and
parity compares direct database decisions with live-adapter outputs rather than
two aliases of one SQL value. Every failed or malformed upload response retires
the cached attempt; only a successful authoritative receipt preserves
idempotent replay. The isolated database matrix now exercises every named
behavioral/gold gate, simultaneous terminal reviews, contradictory receipts,
both terminal replays, duplicate Customer/Management content, existing
verified Customer coverage, and absence of false comparison flags/receipts.
The contribution treatment remains disabled pending DataLab's independent
Cycle 6 verdict.

## Current Data-Quality State

The August 7 production incident was caused by disabled Google Maps billing,
not a failed Vercel deployment or database outage. Google Maps/Places search
rendered `BillingNotEnabledMapError`, and Google photo proxy requests returned
502. Product discovery now reads SeeFood's own `restaurants` corpus first and
has a corpus-backed search route. On August 17, the narrow Places restaurant-
discovery fallback was restored in Google project `gen-lang-client-0239416035`
using a private key restricted to Places API and the separate flag
`GOOGLE_PLACES_DISCOVERY_ENABLED=true`. The account remains an un-upgraded free
trial, so it cannot charge unless somebody manually activates the full account.
Google's console marks the legacy Places request quotas non-adjustable; the
independent production database gate is therefore the enforceable usage stop:
60 requests/day and 1,800/calendar month, denying requests on any guard error.
This is well below Google's displayed monthly no-cost allowance. A scheduled
audit runs before the 90-day trial ends. Google Maps and Google-hosted photos
remain explicitly disabled by `NEXT_PUBLIC_GOOGLE_MAPS_ENABLED=false` and
`GOOGLE_MAPS_ENABLED=false`; the product remains navigable through OpenFreeMap,
corpus search, and independently hosted photos.

Website V3.1 menu recovery is implemented and production evidence is published
for a reviewed subset. The recovery added same-origin sitemap/conventional-path
discovery, semantic and loose menu DOM parsing, menu-image OCR, bounded asset
priority, official-URL recovery tools, and reversible wrong-site quarantine.
The current Temecula funnel is 438 active acquisition entities, 366 with active
websites and attempted, 211 with any retained website menu evidence, 125 with
strong evidence, and 79 attached product entities. The reviewed publication
created 778 new canonical dishes across 18 attached entities and 112 new exact,
menu-linked photo rows. See `docs/WEBSITE_ACQUISITION_V3.md` for run IDs and
quality boundaries.

The July 23 systemic photo audit and cleanup is complete in production. The
rollback tag is `pre-photo-content-dedupe-2026-07-23`. Cleanup runs
`9cb03d8a-fff1-49f4-976c-df07bec16994` and
`8af21372-dad9-40b6-8789-30f92d30f9d9` contain the before/after measurements
and per-row restoration state. Run `59c8ee33-f24d-4a4b-a86b-3b49f7ee3180`
records the conservative restoration of 100 HTTP-429 rows. Run
`8d3de92d-86cb-4682-8b82-f0a79fb5deac` records restoration of 98 canonical
dish IDs from the rollback evidence onto surviving photo identities.

The original Temecula set had 10,637 active rows. It now has 7,812: 7,686
byte-verified unique images and 126 temporarily unreachable rows retained for
later remeasurement. The cleanup deactivated 1,114 exact copies and 1,711
confirmed undeliverable or non-image rows. No exact active hash duplicates
remain. Link-aware measurement now finds 4,408 matched unique photos across
4,364 dishes and 22 comparison-ready dishes; the small increase over the
pre-cleanup 4,405/4,361 is recovered association credit, not invented images.
Near-duplicate candidates,
cross-location chain/template reuse, provenance, and multi-item links were not
deleted.

On July 27 the DL-001 export caught a follow-on fail-open bug: a later crawl
could make an already quarantined row active again when its image fetch failed
transiently and therefore supplied no new content hash. Run
`5f2425c7-6293-4d36-ac09-cf34ecd28222` re-quarantined exactly 1,163 rows already
carrying durable invalid/duplicate evidence across 41 restaurants. The stricter
useful-photo total remained 11,037, verified unique hashes remained 7,609, all
21 comparison dishes remained, and all measured menu-photo coverage rungs were
unchanged. Raw active rows fell from 12,200 to the honest useful total of
11,037. A second apply was a no-op. Rollback tag
`pre-reactivated-photo-quarantine-2026-07-27` and the per-row action log make the
repair reversible.

Olive Garden on Overland has 11 active, byte-unique photos instead of 25
inflated rows. The root cause was changing Google photo-reference tokens being
treated as identity across the three-snapshot retirement window. A separate
website extractor bug also treated arbitrary metadata such as viewport values
and theme colors as image URLs. Both responsible layers are fixed; the UI did
not receive a cosmetic duplicate-hiding rule.

The July 27 delivery-source restoration has rollback tag
`pre-delivery-source-restoration-2026-07-27`. DoorDash had continued to yield
data, but its Temecula batch ignored geographic bounds and its matcher missed
safe provider-shortened names. Grubhub's 270 historical attempts were all empty
because its current SPA requires a delivery location and exposes menu data in
first-party JSON responses rather than the old embedded page shape.

Bounded production pilots added or restored 639 active delivery menu items and
297 new byte-unique photos across Annie's Cafe, Ebullition, Mantra, and BJ's.
DoorDash now has 7,422 active items across 69 restaurants and 4,719
source-provenanced unique active photos across 66; Grubhub has 325 active items
and 149 unique active photos across two restaurants. Temecula's restaurants
with at least seven matched menu photos increased from 72 to 74, and the
20%-of-menu plus seven-photo rung increased from 62 to 64. Basic photo coverage
remained 156 restaurants; comparison strength remained 21 dishes across six
restaurants. No legitimate coverage was removed.

The pilot deliberately caught and reversed one unsafe Grubhub match: when Olive
Garden was unavailable, search returned Campini's as an Italian alternative.
Exactly 172 menu rows and 46 canonical photo rows introduced by that rejected
run were deactivated, not deleted, and source run 1014 was marked failed.
Brand-word matching now rejects cuisine substitutes and ambiguous same-brand
locations; an empty or failed provider result cannot retire good prior data.

## Temecula restaurant publication and GPS availability (August 8, 2026)

Temecula now uses the expansive early-market publication policy documented in
`docs/RESTAURANT_PUBLICATION_POLICY.md`. Every evidenced, not-known-closed
restaurant is visible regardless of menu/photo strength. Review-state raw
business records require a specific food-service category or high-confidence
menu evidence so public-record false positives do not become map restaurants.

Production has 394 verified and live Temecula restaurants: 70 strong, 81
partial, and 243 contribution-needed shells. There are 340 with websites, 146
with active menus, 14,438 distinct active menu items, and 85 with at least one
displayable photographed dish. Neighborhood availability is 98.5%. The rollout
preserved all 79 provider IDs and created 315 stable `seefood:` IDs. It withheld
32 unresolved business candidates and 12 known permanent closures.

Website evidence promotion completed for 126 source groups / 123 entities:
9,962 staged observations were reconciled, 1,453 candidate images passed byte
verification, and 53 inaccessible/non-image URLs were rejected. LRay's Kitchen
and all prior source data were preserved.

Publication run `d4263151-b362-490d-ac24-2d180fc1be4c` is the active reversible
run. The over-broad first run `ba8b77de-5551-4434-a1a2-70340290f652` was fully
rolled back after a live QA spot check exposed a mislabeled sign company. The
pre-change Git rollback tag is `rollback/pre-temecula-show-all-20260808`.

The map displays individual restaurants at neighborhood scale and clusters only
when a viewport exceeds 120 records. GPS lookup requires a fresh reading, uses
a phone-accuracy-aware 250–500 meter venue radius, and includes shells. Shell
pages say "You're in the right place" and offer an immediate first-dish
contribution action. The `/pulse`
headline is intentionally limited to verified, live, strong, and neighborhood
availability; the legacy funnel remains collapsed for diagnosis.

## Handoff Maintenance

Follow `docs/HOW_TO_HAND_OFF.md` for the next lead transition. Update this file
in place; do not accumulate competing handoff snapshots.
