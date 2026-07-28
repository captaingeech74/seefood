# SeeFood Senior Lead Handoff

Updated July 27, 2026. This is the current operational snapshot for the active
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
- Repository: `/Users/ace/Documents/New project/seefood`
- Production branch: `main`; a push to `main` triggers Vercel deployment.
- Baseline handoff commit for the current lead: `857242f`.
- Stack: Next.js 14 App Router, React 18, TypeScript, Tailwind CSS, Supabase
  Postgres, Cloudflare R2, Google Maps, Sharp, and Vitest.
- Verification baseline: 62 tests passing after the corrected DL-001 exporter.
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

## Separate DataLab

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

## Current Data-Quality State

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

## Handoff Maintenance

Follow `docs/HOW_TO_HAND_OFF.md` for the next lead transition. Update this file
in place; do not accumulate competing handoff snapshots.
