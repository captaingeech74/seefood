# DataLab 2.0 Final Record

DataLab 2.0 is complete. Atlas ran six bounded acquisition cycles in the
isolated `seefood-datalab2` worktree on branch
`codex/seefood-datalab-v2`. The final lab commit is `9dcc691`; production data,
application behavior, infrastructure, and deployments were unchanged.

## What SeeFood should do

1. Build one SeeFood-owned, source-neutral restaurant identity graph seeded by
   the monthly Overture Places release.
2. Reconcile records with deterministic name, location, address, phone, and
   website evidence. Quarantine ties, omissions, status changes, website
   conflicts, and proposed duplicate merges until a labeled rollout clears the
   publication threshold.
3. Add a bounded restaurant-website menu collector: one homepage, at most one
   strict menu/order link, then schema.org and client-visible JSON parsing.
   Keep items review-gated initially; do not add a generic website-image
   crawler.
4. Load DoorDash public sitemap matches only as reviewable provider-identity
   proposals. Do not scale browser scraping of DoorDash or Grubhub.
5. Seek sanctioned location/menu/photo feeds from DoorDash first and Grubhub
   second. Explore ChowNow only through a small evaluation sample.

## What the lab measured

- Overture returned 5,732 restaurants across the first three selected boxes
  and 1,238 across six additional US markets. In the six-market sample, all
  1,238 had addresses, 1,180 had phones, 1,088 had websites, and 948 had an
  operating-status field. These selected boxes are not national rates.
- The identity linker recovered all 7 reviewed matcher misses while preserving
  all 4 reviewed true omissions, with no false links in that 11-row reviewed
  fixture. The larger 619-record unresolved set remains a review workload, not
  a measured precision claim.
- DoorDash sitemaps produced 328 conservative unique matches among 1,238
  sampled restaurant identities, but all 12 fresh store-page requests were
  explicitly blocked. Separate July evidence proves strong conditional menu
  and photo yield when a correct store can be reached.
- The website collector found 9 menu surfaces among 24 selected restaurants,
  including 5 for DoorDash-unmatched identities. One menu supplied 37 unique
  items; none of those items linked a dish photo.
- All 12 rendered Grubhub searches worked, but none produced a strict target
  and location match. Separate July pilots produced 325 items and 149 unique
  photos at two known stores and also demonstrated the severe cost of a wrong
  restaurant match.

## Production and negotiation gates

Automatic publication still requires approximately 99% restaurant identity
precision and 95% item linkage precision on a larger labeled rollout. Imports
must be idempotent, provenance-preserving, source-scoped, and reversible. A
failed, empty, or blocked fetch is never closure or deletion evidence.

For DoorDash and Grubhub, request a bounded six-market evaluation extract before
commercial commitment. Required fields are stable restaurant/location,
menu/category/item IDs; names; full addresses and coordinates; operating and
availability status; descriptions; prices; image URLs or bytes; and
update/delete timestamps with daily deltas. Required rights cover production
ingestion, durable derived identity links, menu display, photo storage and
delivery, provenance/attribution, quality review, and correction, retention,
and deletion handling.

## Explicitly deferred

Do not build a delivery-browser farm, county-by-county roster system, second
external backbone, generic restaurant-image scraper, automatic closure from
page failure, automatic duplicate merging, or standalone Toast, Square, or
SpotHopper connector. A paid commercial roster is also deferred because the lab
did not measure enough incremental value to justify one.

The complete cycle results, collectors, sanitized fixtures, final source
ranking, and implementation backlog live at the final DataLab 2.0 commit.
