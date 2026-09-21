# Structured menu platform pass — September 21, 2026

## Product outcome

Completed the bounded existing-corpus pass: 526 website routes covering 483
live restaurant entities, followed by 13 location-separated SpotOn ordering
route checks. The inexpensive discovery pass examined 2,307 website URLs.
These are attempts, not claims of complete restaurant coverage.

Campaign-attributable live gains across the 27 imported entities:

- **823 additional usable photo records at 26 restaurants.**
- **487 additional distinct dishes with a directly linked active photo.**
- **11 restaurants gained their first usable photos.**
- **2,531 additional active menu rows** (not necessarily distinct dishes).
- Downriver Grill gained menu text but no photos: its many different image
  URLs returned identical placeholder bytes. None were published as food.
- No previously active useful photo or menu row was removed. One newly
  imported responsive-image duplicate was collapsed while preserving links.

Examples, before → after usable photos:

| Restaurant | Before | After |
| --- | ---: | ---: |
| Penfold's Cafe & Bakery | 0 | 104 |
| Gregorio's Restaurant | 0 | 88 |
| Margarita's Cocina y Cantina | 0 | 53 |
| Thai One On | 0 | 48 |
| Luke's On Front | 0 | 29 |
| Ki's Restaurant | 4 | 51 |
| Shawn O'Donnell's Spokane | 12 | 50 |
| Logan Tavern | 0 | 14 |

The overall corpus moved from 30,822 to 31,661 usable photo records. **16 of
that increase occurred at four other restaurants outside this campaign**;
they are not credited to this work. The headline 823 excludes them.

“Usable” means active, orderable, non-storefront, not dedupe-quarantined;
entity counts collapse exact byte hashes. Recognized provider asset paths now
also collapse responsive variants. This is not a claim that machine vision
verified every image, or that all possible cross-provider near-copies were
removed. Pictured-dish counts use the unchanged baseline's direct active
menu-photo join; additional many-to-many links are not inflated into that count.

## What changed permanently

1. Partial acquisitions add/refresh evidence without treating unvisited or
   failed sources as proof that existing menus/photos disappeared.
2. Structured extraction recognizes nested image fields and explicit cents,
   excludes modifier/option trees, and merges dish-size repetitions.
3. Location routing rejects conflicting branch menu paths. Reviewer names,
   portraits, obvious merchandise, and availability announcements are not
   promoted as dishes. Owner thumbnails resolve to original assets.
4. SpotOn is now a recognized source with public ordering-link routing and
   free local extraction. Its legacy paid rendering fallback is disabled.
5. Exact image bytes and recognized immutable provider asset paths deduplicate
   photos while retaining source observations and multiple dish links.
6. **26 reviewed productive routes** have a bounded monthly refresh through
   the existing Mac nightly job: at most three stale routes per night, four
   pages per route. It runs only while the Mac is available, not as a cloud
   availability guarantee. Transient misses cannot remove good existing data.

## Provider conclusions and limits

Toast, Owner, Popmenu, and Slice produced the clearest recoveries. SpotOn also
produced real gains at Logan Tavern, both correctly separated Onion locations,
and Killarney's. Other SpotOn menus exposed no photos or placeholder images;
Feast's dated availability notices were excluded rather than made into dishes.

SpotHopper and other already-working providers were rerun; many results repeated
existing coverage. Square/Wix hints often meant a link or site-builder footprint,
not an accessible photo menu. No claim of comprehensive Square, Wix, Olo,
ChowNow, or every regional platform integration is made. Cabo had no verified
publication gains in this pass. No paid calls or new paid services were used.

Wrong-location/ambiguous evidence was not published: Sushi House's Illinois
site, a TouchBistro corporate article attached to Steam Plant, Mikko's Vista
branch menu, generic multi-branch menus without location applicability, and
duplicate Archive/Logan identities. Existing rows were not broadly deleted.
Low-confidence generic gallery matching remains separate from this structured
menu campaign; good unmatched photos are still valid restaurant-level evidence.

## Verification and recovery

187 tests passed, TypeScript and production build passed. Live mobile and
desktop browser checks cover newly enriched restaurants and Rainbow Oaks.
Production release details are recorded in HANDOFF.md.

Rollback code point: `rollback/pre-structured-platforms-20260920` (pushed).
Ignored evidence, preimages, per-restaurant publication journals, fixed baseline,
and final measurements: `logs/structured-platforms-20260920/`.
`publication/*.before.json` preserves original rows; `*.done.json` records
source snapshot IDs. `variant-cleanup-before.json` preserves the one duplicate
row and its original provenance/links. Do not blindly replay old preimages over
later user contributions; restore only campaign-owned changes.

Runbook: `scripts/structured-platform-pilot.ts` collects only;
`prepare-structured-publication.ts` uses an explicit reviewed route manifest;
`publish-structured-platforms.ts` previews unless `--publish`, verifies bytes,
backs up, journals, and skips completed identical groups. Interrupted groups
require inspection, not automatic overwriting. `refresh-structured-platforms.ts`
reuses this same path and the checked-in route registry.

## Judgment

This is a meaningful acquisition and reliability upgrade, not a corpus-wide
transformation: roughly 2.7% more usable photos, with much larger improvements
at formerly empty venues. The next leverage is converting more restaurant
visits into a reliably excellent **what should I order here?** experience,
not maximizing provider names or raw crawl totals.
