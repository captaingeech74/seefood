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

