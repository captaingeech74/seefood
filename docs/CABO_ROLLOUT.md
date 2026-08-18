# Los Cabos rollout — working operating record

Updated August 17, 2026. This document records the proposed Los Cabos rollout,
the methods actually used, and the evidence needed to explain the result later.
It is a working record, not a claim that the market is already complete.

## Product outcome

Build a trustworthy visitor-facing market covering Cabo San Lucas, the Tourist
Corridor, San José del Cabo, and nearby destination restaurants that a visitor
would reasonably consider part of Los Cabos. A confidently real restaurant
should be visible and GPS-discoverable even when its menu or photo coverage is
thin. Menu and photo strength must remain honestly labeled.

The first estimate is deliberately a candidate frame rather than a final count:

- Mexico's May 2026 DENUE file contains 2,580 restaurant-class establishments
  in Los Cabos municipality, including 2,516 in Cabo San Lucas and San José del
  Cabo localities.
- The July 2026 Overture bounding-box sample contains 3,419 possible
  food-service places and 1,069 records with at least one website. Overture's
  broader category set includes noise and cannot be published as-is.

The rollout must reconcile these sources into one SeeFood-owned identity graph.
Raw source totals are not restaurant coverage.

## Zero-new-cost boundary

The initial roster, enrichment, publication, and QA must require no new paid
dataset, API, proxy network, scraping service, OCR service, software
subscription, or hosting tier. Existing fixed production services and ordinary
local electricity and Internet access are not new project purchases.

Use these controls:

1. Use free DENUE bulk open data and Overture data for the roster backbone.
2. Run public-website collection, PDF extraction, image classification, and OCR
   locally. Paid Google, Mistral, proxy, CAPTCHA-solving, and delivery-platform
   APIs remain disabled.
3. Store only useful, byte-verified food images. Reject interiors, apparel,
   promotional graphics, inaccessible assets, and exact size variants. A good
   unmatched food photo may remain attached to its restaurant without an
   invented dish match.
4. Normalize and compress images before durable storage and reuse existing
   content hashes instead of storing the same bytes twice.
5. Record database size, R2 object count and bytes, and relevant operation
   counts before and after every publication stage. As of August 17, 2026, the
   database is approximately 803 MB and R2 contains approximately 0.075 GiB in
   182 objects.
6. Keep total R2 Standard storage below 8 GiB during the initial rollout,
   preserving headroom below its current 10 GB-month free allowance. Keep Cabo
   database growth below 1 GiB until a measured review confirms that the next
   stage remains inside existing included capacity.
7. If a guard would be crossed, stop that stage before the paid operation,
   compact or narrow the stored evidence, and report the constraint. Do not
   silently incur an overage.

## Proposed operating stages

Before importing Cabo, repair the crawler scheduler and Overture CLI entry point
that still contain the repository's former `New project` path. Add one reporting
view that separates market-managed, legitimate legacy, duplicate, invalid, and
unassigned entities so Cabo cannot silently inflate the existing global total.

1. Add explicit Mexico support to the market importer: country-aware address
   selection, Mexican address and phone formats, Unicode names, and an official
   visitor-zone boundary.
2. Import DENUE and Overture into review, preserving stable external IDs,
   source release, source fields, and input hashes.
3. Reconcile duplicates using name, coordinates, address, phone, and website.
   Quarantine ties, category conflicts, probable hotels without a distinct
   restaurant, and bad coordinates.
4. Publish every high-confidence, not-known-closed restaurant with stable
   SeeFood identity and GPS availability. Thin restaurants remain honest
   shells; raw candidates do not become restaurants merely to increase totals.
5. Crawl official websites with English and Spanish route discovery, including
   `menu`, `menú`, `carta`, `gallery`, `galería`, `food`, `comida`, `platillos`,
   `restaurants`, and `gastronomía`. Treat named restaurants inside resort
   websites as distinct venues when identity evidence supports them.
6. Extract structured pages, menu pages, PDFs, menu images, and useful gallery
   food. Publish through the existing byte verification, food classification,
   provenance, deduplication, and dish-linkage gates.
7. Prioritize a visitor-facing QA cohort for richness while preserving the
   complete verified map roster. Onsite QA measures correct venue recognition,
   useful visual choices, search, and thin-restaurant recovery.

## Cabo-specific identity and UX risk

Resorts frequently contain several real restaurants with one street address,
one parent website, and nearly identical coordinates. They must not be merged
merely because they share those fields. Preserve the resort as parent context
and each named dining venue as its own restaurant identity. Restaurant selection
does not use a resort-specific exception: every location uses the same GPS
confidence rule. A clearly closer venue opens automatically; when phone accuracy
cannot distinguish plausible nearby restaurants, SeeFood immediately shows a
short named choice. The same fallback covers malls, airports, food halls, and
ordinary shared addresses.

The website collector must also treat one resort domain as a possible source
for multiple distinct restaurant and menu pages. A domain-level success for one
venue does not complete every restaurant at that resort.

## Lightweight success bar

Avoid turning the rollout into another research program. Use only four gates:

1. A practical reviewed sample supports the existing high-precision restaurant
   identity threshold; obvious hotels, shops, beaches, and duplicate venues do
   not publish as restaurants.
2. Every published restaurant has valid coordinates and is available to nearby
   GPS lookup; ambiguous co-located resort venues resolve through a named
   choice.
3. Every accepted restaurant with a credible website receives a bounded crawl
   attempt, and the highest-value visitor cohort is enriched first.
4. The final onsite QA reports correct-place recognition and whether the food
   shown was useful. Failures remain visible in the report and backlog.

An itinerary or hotel area from the visiting tester is helpful but not a build
dependency. When available, use it only to prioritize the rich QA cohort, not
to narrow the underlying verified Cabo roster.

## Reproducibility record

Every stage must leave enough evidence to explain why it worked or failed:

- exact source names, release dates, download URLs, licenses/attribution, and
  SHA-256 input hashes;
- market boundary and hash;
- code commit, configuration, start/end time, and deterministic selection or
  priority rule;
- candidate, accepted, matched, created, quarantined, rejected, and duplicate
  counts with reason categories;
- websites found and attempted; pages, PDFs, and assets inspected; failure and
  block categories; menus, items, useful photos, and matched photos gained;
- before/after database and object-storage measurements;
- manual review sample and onsite QA results, including failures;
- publication run ID, exact rollback point, and idempotent rerun result; and
- important judgment changes recorded in `DECISIONS.md`.

Do not retain credentials, private data, unnecessary page bodies, or an
unbounded raw crawl in the evidence record.

## August 17 opening checkpoint

The zero-cost opening stage is complete and reproducible:

- A rollback tag, `rollback/pre-cabo-rollout-20260817`, was pushed before any
  production-data change.
- The Overture July 22, 2026 sample produced 14,168 raw place rows, 3,419
  food-service candidates, and 1,059 website observations. The input SHA-256 is
  `825264b8b361a11b2ec4be28b0bb5bef4465fe7b0df1dbfc332f78307af115e4` and
  the reversible review batch is `e27b9ef1-ced4-4906-a78f-89026657c57d`.
  Those records remain review data; they were not bulk-published.
- The first live priority cohort is Hotel Riu Palace Baja California. RIU's
  current official page lists eight named dining venues: Promenade, Krystal,
  Yu Hi, Agave, Sofia, Guacamole, Elite Club, and Pepe's Food. Each is a
  separate restaurant beneath one resort parent. Three were reconciled to
  existing Overture identities; five were newly created. The official-source
  batch is `0096e627-c141-40dc-9613-b42bdca53bd5` and the reversible publication
  run is `351e5dbf-a9d4-490d-a2a1-d6529013962d`.
  The normalized-evidence idempotency batch is
  `d71f64d8-0452-4563-9344-d674a0a73fcc`; an immediate rerun made zero changes.
- Six venues expose current first-party RIU food menus. After intentionally
  excluding the shared wine catalog, they contain 85 current dishes and 82
  byte-verified, menu-matched management photos. Every active photo has unique
  bytes. Promenade and Pepe's Food are honest restaurant shells because RIU
  offers no static dish menu for their buffet/grill; venue/interior images were
  not mislabeled as dish photos.
- GPS ambiguity is universal rather than resort-specific: a clearly closer
  restaurant opens automatically, while genuinely indistinguishable nearby
  venues immediately open a named choice without requiring a cluster tap.
- The moved repository path was repaired in the installed nightly LaunchAgent,
  and Overture now launches through the relocatable virtual-environment Python
  module rather than a wrapper containing the former path.
- Database size after the stage was approximately 827 MB, up from the recorded
  803 MB baseline. No new paid API, proxy, OCR, dataset, storage plan, or
  hosting tier was used.

### Google status

Both Google keys still exist, and stored Google Place IDs were preserved.
Google currently rejects live Places requests with `REQUEST_DENIED` because
billing is not enabled on the Google Cloud project. That removes Google search,
live place-detail verification, and Google-hosted photo delivery; it does not
remove SeeFood's corpus, OpenFreeMap map, independent search, or saved IDs.

Google restaurant discovery is now technically isolated from Google maps,
photos, coverage tools, and diagnostics. The discovery lane fails closed behind
an application counter capped at 60 requests per day and 1,800 per month, well
below the current 5,000-request monthly Nearby Search allowance. Google Cloud
quotas remain a required independent stop before the production flag is enabled.
Do not make Google the durable menu/photo backbone: Google content storage and
attribution rules are materially more restrictive than storing Place IDs and
first-party restaurant evidence.

## Completion report

The final plain-language report should state:

- how many credible restaurants were found and published;
- how many are GPS-discoverable, have websites, have menus, have useful food
  photos, and have menu-matched photos;
- how many candidates were rejected or quarantined and why;
- whether onsite restaurant recognition worked in the QA cohort;
- exactly what the build cost, including a truthful `$0` only if no new charge
  or overage occurred; and
- which methods produced the useful gains so they can be repeated in the next
  market.
