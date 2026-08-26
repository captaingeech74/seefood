# Website Acquisition V3

Updated August 9, 2026.

V3 is the durable website-acquisition path. It preserves useful evidence from
the original collector and V2 while fixing the operational gaps found in the
Temecula benchmark: expensive fallbacks ran too eagerly, generic page images
competed with dish-linked assets, PDF quality was uneven, and staged evidence
was not unified into one reviewable corpus.

## Architecture

- Direct HTTP is always attempted first. A blocked or JavaScript-dependent page
  escalates through curl-cffi, Patchright network capture, then Scrapling.
- Crawl4AI remains available only for explicit deep discovery; it is not part of
  the normal fallback chain because it added cost without enough incremental
  evidence in the full-market run.
- Crawlee provides durable leases, retries, bounded concurrency, and per-domain
  serialization. Every active website row is eligible; the worker does not
  silently discard secondary official URLs attached to an entity.
- Structured data, visible menu shapes, and public first-party JSON are stored
  with exact extraction method, content fingerprint, source URL, and run ID.
- Dish-linked images and PDFs enter a durable asset queue. Generic page imagery
  is retained as low-priority evidence but does not consume immediate download
  and verification work.
- Menu, gallery, galleries, photos, food, dishes, and cuisine pages are explicit
  priority crawl targets. Small sites are explored broadly up to a hard
  12-page ceiling; large sites spend that same budget on the priority pages
  first. This finds useful content outside a fixed vocabulary without letting
  large blogs, stores, or location directories run away. Official images with meaningful captions, alt text,
  or filenames become named candidates; interiors, storefronts, people, logos,
  drinks, events, and apparel are excluded from automatic dish matching.
- Common responsive variants from Squarespace and Wix collapse to their stable
  original asset URL before download. Exact byte hashes provide the second
  deduplication layer, so alternate URLs for the same image do not inflate the
  product photo count.
- A named official food photo attaches automatically only when it has one clear
  menu-dish match. Exact names, contained names, a small set of harmless cooking
  modifiers, and the common `avo`/`avocado` abbreviation are accepted. Shared
  words alone are not enough.
- Byte-verified food photos that cannot be named safely may still be published
  as unnamed Management photos for a photo-poor restaurant. Their nearby text
  is selection evidence, not a dish claim. The publication path caps these at
  two per restaurant and rejects obvious interiors, people, merchandise,
  drinks, stale pages, foreign-country domains, and mismatched branch sites.
- Generic website imagery is not display evidence merely because it came from
  Schema.org or an official corporate site. It must be positively supported as
  relevant food before publication. Legacy generic imagery may be reversibly
  quarantined once a restaurant already has seven positively identified photos;
  photo-poor restaurants keep their candidates staged for content review so
  legitimate unmatched food is not lost.
- One failed observation never retires known-good evidence. Staleness requires
  two successful crawls that both establish absence.
- V2 evidence is merged idempotently into the same durable observation layer.
  Publication is a separate, explicit, scoped operation and never happens as a
  side effect of crawling.

## PDF and OCR routing

Embedded PDF text is parsed first. Weak or image-only documents route through a
provider interface configured by `SEEFOOD_OCR_PROVIDERS`:

- `paddleocr_vl` is the default local path and is immediately runnable on the
  current Apple Silicon environment.
- `unlimited_ocr` supports Baidu Unlimited-OCR through a separately hosted GPU
  endpoint configured with `SEEFOOD_UNLIMITED_OCR_URL`. The model is promising
  for long menus and multi-page documents but is too new, and too dependent on
  NVIDIA-oriented serving, to become the unmeasured default.
- `mistral_ocr` supports Mistral OCR 4 through its API. It is disabled unless
  `MISTRAL_API_KEY` is deliberately supplied, so normal collection makes no paid
  calls.
- `generic_local` permits a compatible internal OCR service.

Provider attempts and failures are recorded. No vendor benchmark is treated as
a SeeFood result; the three engines should be compared on the same representative
menu-PDF set before changing the default.

## Operations

```bash
npm run acquisition:websites-v3 -- --market temecula-ca --limit 5000 --concurrency 12
npm run acquisition:merge-website-evidence -- --market temecula-ca --v2-run-id <uuid>
npx tsx scripts/promote-website-observations.ts --market temecula-ca
npx tsx scripts/promote-website-observations.ts --market temecula-ca --publish
```

The promotion command previews by default. `--publish` is required for writes.
It rejects test fixtures and weak observations, deduplicates normalized dish
names, byte-verifies every proposed image, and records publication snapshots.

For a photo-only refresh of every website already attached to the live product:

```bash
npm run acquisition:rerun-product-corpus -- --limit 200 --concurrency 12
npm run acquisition:promote-matched-photos -- --run-id <uuid>
npm run acquisition:promote-unmatched-photos -- --run-id <uuid>
npm run acquisition:measure-product-corpus -- --run-id <uuid>
```

The two promotion commands also preview by default. They never create or retire
menu rows. Matched publication requires a byte-verified image, a unique exact
name match, and an already-current menu item. Unmatched publication creates an
honest restaurant-level photo with no invented dish name.

## Live product corpus rerun

The August 9 rerun revisited all 559 distinct active website routes selected
for the 505 live-product entities that had at least one website. Final route
outcomes were 311 completed with evidence, 229 completed without useful menu
or photo evidence, 19 blocked by the site, and zero unresolved failures. One
unusually deep winery page exposed a parser recursion bug; after the shallow
text fix, the same route completed successfully.

Across the run, 12,259 priority assets were attempted and 11,718 completed byte
verification. Discovery remained deliberately broader than publication. The
final reviewed publication produced 295 new photo rows across 40 restaurants:
274 were attached to an existing exact menu item and 21 were useful official
food photos kept honestly unnamed. No menu row or existing photo was retired.

Net live-product results versus the fixed pre-run snapshot:

- restaurants/entities with a useful photo: 243 to 264 (+21);
- restaurants/entities with a named or menu-linked photo: 144 to 152 (+8);
- restaurants/entities with a current-menu-linked photo: 132 to 140 (+8);
- useful active photos: 21,913 to 22,239 (+326);
- exact unique active image bytes: 17,367 to 17,659 (+292);
- active Management photos: 18,488 to 18,814 (+326);
- legitimate coverage removed: zero.

The difference between attempted promotions and net new rows is expected:
existing URLs and byte-identical images are updated or deduplicated rather than
counted again. Rollback point: `rollback/pre-product-corpus-photo-rerun-20260809`.

## Temecula result

Full V3 run: `8814c13b-0287-4807-887a-506d4a5813fd`.

- 504 website records attempted; 58 yielded data, 415 completed without menu
  evidence, 31 were blocked, and none failed terminally.
- 6,577 raw item observations, 1,357 dish-linked image URLs, 95 PDFs, and 1,156
  PDF-derived items were recorded.
- 1,425 immediate assets completed and produced 680 exact unique linked image
  byte identities. Another 18,998 generic image candidates were staged without
  consuming immediate verification capacity.
- V3 alone found 5,017 unique entity/dish pairs across 56 entities. V2 alone
  found 5,115 across 59. Their unified evidence contains 5,560 across 66, proving
  that V3 is a better operating architecture but not a strict content superset.
- The reviewed production publication added 542 new canonical dishes across
  nine existing restaurant pages and 249 photo records representing 248 new
  exact image byte identities. All 316 promoted image candidates passed byte
  verification. It deepened existing menus; it did not give a restaurant its
  first menu.

Rollback point: `rollback/pre-website-v3-20260803`.

LRay's Kitchen remains a protected `test_fixture` and was excluded from
publication.

## Legacy generic-image quarantine

On August 26, the adaptive legacy audit found 1,505 active, orderable Schema.org
images across 43 already well-covered restaurants that had no menu-item link,
canonical dish, dish label, or hero evidence. The rows represented 1,198 exact
image byte identities. They were reversibly quarantined under run
`8686c893-314b-4ff3-8838-7ca29ebef016`; no positively identified photo and no
restaurant-level photo coverage was lost. Crunchy Munchy changed from 76 visible
photos to its 23 DoorDash menu-linked photos. The product read path now requires
both display eligibility and the absence of a quarantine reason, and a later
crawl cannot republish the same content-rejected bytes without deliberate
review or rollback.

Rollback point: `rollback/pre-generic-website-photo-quarantine-20260826`.

## Official-gallery validation

The August 9 Spokane validation corrected the omission that had left Wooden
City's official gallery unused. Run `4b5a466a-60de-4a51-bead-54b81db062b0`
attempted all four Spokane website records and completed all four. It verified
137 priority assets representing 85 exact image-byte identities. Seventy
explicitly named food-photo candidates produced six observation matches; review
confirmed four unique Wooden City dish photos and one additional same-site match
for Shawn O'Donnell's, alongside Shawn's existing Spokane ordering photos.

The validation also caught a multi-location boundary failure before publication:
an earlier run had followed Shawn O'Donnell's Spokane into an Everett menu. The
crawler now rejects conflicting same-site location parameters. Twelve affected
staging observations were quarantined under
`wrong_location_menu_photo_match`; the quarantine log makes that cleanup
reversible, and none of those records reached the application.

## Menu-recovery pass

The August 3 follow-up focused on the first major retrieval break: official
websites that visibly had a menu but produced no structured menu evidence.
V3.1 adds same-origin sitemap discovery, a bounded `/menu`/`/menus`/`/food-menu`
probe, price-free semantic menu cards, generated-class menu layouts, explicit
menu-image discovery, and OCR routing for JPEG/PNG/WebP menu documents. It also
enforces restaurant/ordering-storefront identity boundaries so a platform's
marketing site or an unrelated redirect cannot become restaurant evidence.

Run `e46ab0e8-5683-4897-b076-e169056e470c` attempted 460 prior misses: 151
completed with evidence, 280 were empty, 29 were blocked, and none failed
terminally. It found menu evidence at 91 entities, 11,924 raw item observations,
40 PDFs, and 1,346 priority assets; 1,341 assets completed, yielding 341
PDF/menu-image items and 605 exact generic-image identities. A separate
semantic recovery run (`e66231ee-6cd9-4ef2-aad9-d564df41dfe2`) attempted 297
remaining targets and found candidate evidence at 43 entities. Review accepted
12 strong entities/959 strong rows; weak price-free headings remain staged and
do not become product claims.

Publication was deliberately narrower than retrieval. Eighteen reviewed
attached restaurant entities produced 1,207 published observations, including
778 genuinely new canonical dishes and 112 newly created, byte-unique,
menu-linked photo rows. Eight wrong-site entity groups (381 observations) were
quarantined with reversible audit records. LRay's Kitchen and all weak evidence
remained untouched.

Current Temecula website funnel: 438 active acquisition entities, 366 with an
active website, all 366 attempted, 211 with any retained menu evidence, and 125
with strong retained evidence. Only 79 entities are currently attached to an
application restaurant row; website acquisition can deepen the evidence graph
before product attachment, but it does not itself publish 438 restaurant pages.

## Product resilience when Google is unavailable

Google Maps billing was disabled on August 7, causing the manual map search,
shared restaurant lookup, and `/api/photo` proxy to fail together. The product
now searches and opens restaurants from SeeFood's own corpus first. Google Maps
is an optional enhancement enabled only when
`NEXT_PUBLIC_GOOGLE_MAPS_ENABLED=true`; server-rendered Google photo references
are enabled only when `GOOGLE_MAPS_ENABLED=true`. When disabled, independent
website/delivery/customer images continue to render and Google-only restaurants
show an honest empty state rather than broken tiles. Restoring Google billing
and both flags restores the map and Google-photo lane without changing corpus
search.
