# Cycle 4 — Restaurant Websites and Ordering Platforms

## Decision

**Implement with review:** build the small connector mix of one restaurant
homepage, one strictly ranked menu/order link, and schema.org/client-visible
JSON parsing. It found more menu surfaces than any provider-specific parser and
added menus where DoorDash identity was absent. Treat extracted items as
review-gated and do not build photo downloading yet: linked dish-photo yield was
zero. ChowNow is the highest-value named connector observed, but its evidence is
one structured menu, so extend it only inside this simple mix rather than as a
standalone integration.

## Real sample and denominators

The deterministic purposive sample used 24 Cycle 2 website identities: 12
accepted and 12 quarantined, excluding known human-reviewed contradictions.
Every Cycle 1 market contributed two DoorDash-sitemap-matched and two unmatched
restaurants. The sample contained 11 brand-bearing chains and 13 independents;
perfect chain balance was unavailable in two cells. These selected boxes are
not a national probability sample.

The collector made 38 unique one-attempt requests: 24 homepages and 14 second
pages, with no restaurant receiving more than one second-page attempt. Nine
second pages passed the final strict menu/order URL rule. Five early candidates
from a broader content-link rule did not and are retained as measured selector
errors but excluded from yield; the final rule and tests reject those patterns.
No request exceeded the 30-second timeout (maximum 2.652 seconds). Ten requests
failed, including four explicit blocks. Total transfer was 9,512,380 bytes.

## Menu, item, photo, overlap, and duplicate yield

Accessible menu/order surfaces were found for **9/24 restaurants**. Only
**1/24** exposed extractable structured items: 39 schema.org `MenuItem`
observations reduced to **37 unique items**, for two duplicate observations of
inflation. None of the 37 items linked a dish photo, so unique photo URLs,
download attempts, valid downloaded photos, content hashes, and photo-content
duplicate inflation were all zero. This is a measured zero; generic unlinked
page imagery was deliberately not counted as dish photography.

Identity disposition remained separate: accepted sites produced 7/12 menu
surfaces, one structured menu, 37 items, and zero item photos; quarantined sites
produced 2/12 menu surfaces, zero structured items, and zero item photos.

DoorDash overlap was also separate. The 12 sitemap-matched identities produced
4 menu surfaces, zero structured items, and zero item photos. The 12 unmatched
identities produced **5 incremental menu surfaces**, one structured menu, 37
items, and zero item photos. This is incremental yield over a provider-identity
signal, not a comparison with fresh DoorDash menus, which Cycle 3 could not
fetch.

## Provider ranking, errors, and practicality

| Detected provider | Restaurants | Menu surfaces | Structured menus | Unique items | Linked item photos |
|---|---:|---:|---:|---:|---:|
| ChowNow | 2 | 2 | 1 | 37 | 0 |
| Square | 2 | 1 | 0 | 0 | 0 |
| Toast | 4 | 0 | 0 | 0 | 0 |
| SpotHopper | 1 | 0 | 0 | 0 | 0 |

ChowNow therefore wins among named providers, while the generic one-hop link
plus schema.org mix wins overall. One direct ChowNow page exposed the 37 items;
the other was a client shell. Toast's selected ordering pages were blocked or
did not pass the final usable-menu rule. Square pages were client-rendered with
no raw structured items, and the SpotHopper signal was a non-menu vendor link.
Blocked and dynamic providers were not retried or rendered.

Observed failures were dead/DNS-failing sites, redirects not treated as
success, explicit provider blocks, client-only menus, visual menus without
structured items, broad link-ranking false positives, incidental vendor
signatures, and schema items without photos. The eight-row selected hash-only
review corroborated four menu outcomes and four bounded no-menu outcomes.

The final collector is standard-library Python, uses no paid service, and can
run with the monthly identity refresh. At this sample's size it used 38 public
requests and about 9.5 MB. Refresh overlap was not measured because every URL
was observed once.

- **Technical value: Medium.** The simple mix supplies incremental menu
  discovery and occasional high-density item data, but item/photo reach is
  sparse.
- **Production readiness: Review.** Identity quarantine must carry through;
  page layout and platform shells are unstable; 37 items from one menu do not
  establish the 95% linkage threshold.

## Agreement needs

Technical yield does not establish reuse rights. For restaurant-owned pages,
retain URL/provenance and seek owner permission before storing or serving menu
photos; no photo ingestion is justified by this sample anyway. If pursuing the
named connector, ask **ChowNow** for a sanctioned US restaurant/menu API or
daily feed with stable restaurant, menu, category and item IDs; names,
descriptions, prices, image URLs or bytes, availability, update/delete times and
deltas; and explicit rights for production ingestion, derived identity links,
photo storage/delivery, and provenance display. The single 37-item success
justifies a bounded product conversation, not a broad commercial commitment.

Reproduction is in `cycle4_webmenus.py`; sanitized aggregates are in
`CYCLE4_METRICS.json`, and review labels are separate in
`cycle4_review_fixture.json`. Raw pages, URLs, and any downloaded bytes remain
ignored. No production files, credentials, writes, paid calls, or deploys were
used.
