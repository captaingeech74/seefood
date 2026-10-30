# Maple Grove, Minnesota — October 29, 2026

Market: `maple-grove-mn`. Footprint: incorporated city, Census GEOID 2740166,
not the whole Twin Cities or every nearby Maple Grove mailing address.

## Live outcome

Previously zero product listings. Now **166 live restaurants**, 159 with website
URLs, **663 menu entries at 9 venues**, and **217 useful photos at 43 venues**
(180 menu-linked). This is broad identity availability, not complete photo
coverage or proof that every restaurant has been found. Final row-level evidence
is in ignored `logs/maple-grove/measured.json`.

Rich examples: Buca di Beppo, Bonchon, Frankie's Chicago Style Pizza, El Rodeo,
Riviera Maya, and Fazenda. Original Pancake House and Dancing Ganesha have text
menus but no approved gallery yet. Thin venues remain searchable/GPS-eligible.

## Sources, review, and limits

- Overture October 21 release, clipped to the official Census polygon. The
  downloaded 3,925 places are all business types, **not** 3,925 restaurants.
  The graph retains 242 candidates, including closed/held/duplicate records.
- The [local tourism directory](https://experiencemaplegrove.com/dine/) has 138
  published entries. It also includes duplicates, broader-area venues and
  announced openings; it is not an exact current restaurant census.
- Independently evidenced additions cover restaurant/entertainment venues,
  misclassified Firehouse Subs, Nadia Cakes, Kingdom Coffee and Dancing Ganesha.
  Obvious private/joke venues, offices, wrong locations and conflicting former
  tenants were held. Hope Breakfast Bar's own site still says coming soon.
- Corrected Grill Hall to current Fazenda name/address and the mislabeled
  Bruegger's identity. Existing slugs remain stable.
- Shared V3 attempted 216 original entity/URL routes plus seven supplemental
  routes, including PDF menus. Counts of routes, staged menu observations and
  extracted image links are never described as published restaurant coverage.
  Some held candidates were crawled before review finished; review identities
  before the expensive asset pass on future city onboarding.
- Reviewed exact location menus and image contact sheets before additive
  publication. Drinks, app/map ads, promotional overlays and dubious dish
  labels were withheld. Official sites can make bad image assignments too.
  Useful unmatched food uses the conservative local macOS Vision lane,
  explicitly scoped to Maple Grove. No paid scraper/model/API or new service.
- Ten DoorDash pilot venues initially exposed a multi-word-city discovery bug.
  The repaired pilot found matching URLs but no accepted new menu/photo data:
  fetched identities were unprovable or no unique store matched. It was not
  expanded into an unproductive city-wide browser sweep.

## Reusable fixes

1. Preserve current Overture `taxonomy`/`basic_category` after removal of legacy
   `categories`, while retaining old-format support and primary-category safety.
   Align ordinary dessert/donut/bubble-tea publication categories.
2. Do not merge unrelated coffee brands at one address on the word “coffee.”
   Kingdom Coffee remains separate from the closed Dunn Bros predecessor.
3. Match multi-word cities to hyphenated DoorDash slugs with token boundaries;
   keep branch/brand verification intact. This also repairs San Diego discovery.
4. Explicit provider passes use provider-attempt freshness, not the restaurant
   row's `updated_at`: a new identity does not mean a newly collected menu.
5. Use Chromium's documented full-browser headless channel instead of requiring
   a redundant shell binary. HTTPS preflight/route verification is unchanged;
   rendered retrieval was tested. The optional browser setup had delayed this run.
6. A cuisine/country word is not distinctive restaurant identity. Final visual
   QA found China Dragon linked to China Palace in New Hampshire. That website,
   photo and unverified former Maple Grove identity were withheld; generic
   cuisine tokens no longer establish a first-photo URL match.

## Evidence and rollback

Registration: `db/migrations/2026-10-29-maple-grove-market.sql`.
Scoped adjudication: `scripts/review-maple-grove.ts` and its reviewed config.
Ignored `logs/maple-grove/` retains raw public input, classification/identity
preimages, decisions, manifests, contact sheets, publisher journals and results.

- Overture batches: `2627761b-34e9-4168-b5f6-028ba0cfe08e`,
  `29de0cd3-c05a-4889-83c6-1492a061082f`.
- Publication runs: `e00ef297-ef34-4fcc-9c1c-09b72e657abf`,
  `6b685848-be13-43a9-a5de-8397341a6d32`; later dessert publication recorded locally.
- V3 runs: `c51c2b6d-15c0-4838-ae27-b035aa7ee7a6`,
  `a2a5e83d-2153-464a-8eea-ceaf82aa5e8a`.
- First-photo run: `885da126-2d7e-41ca-9a91-e49b83d83517`.
- Final first-photo run: `53b778d2-8d97-46cd-8609-d6029d594cd8`; 31 of its 32
  published candidates remain after rejecting the wrong-restaurant photo.
- Pushed code rollback tag: `rollback/pre-maple-grove-20261029` at `5637efb`.

Use existing market-publication, Overture-batch, and zero-photo-run rollback
commands. Reviewed source imports retain per-group preimages. Git rollback does
not undo database data. Preserve subsequent customer uploads; never cascade-delete
restaurants/provenance to undo imports. No preexisting city data was removed.

Existing all-live-city structured refresh includes this market automatically;
there is no new automation or permanent research project.

Verification: 204 tests, TypeScript and production build pass; desktop/phone
gallery, search and stored nearby-restaurant lookup checked independently.
