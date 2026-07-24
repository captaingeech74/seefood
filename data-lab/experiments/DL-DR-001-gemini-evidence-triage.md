# Experiment: DL-DR-001 Gemini Evidence Triage

## Decision Target

Which Gemini Deep Research claims are strong enough to change the DataLab
source registry and experiment queue?

## Hypothesis

Primary-source checking will retain several real Management-photo opportunities
but will materially narrow the reported Customer-photo and Temecula-census
claims because the Gemini response supplied no citation URLs or sample data.

## Safety

This was a bounded documentation audit. No production read or write, provider
API call, account creation, credential use, vendor contact, model call, paid
quota, image download, or crawl occurred.

## Cohort

The highest-leverage claims from the returned Gemini report:

1. Overture Places/GERS.
2. Riverside County Department of Environmental Health.
3. Google Business Profile FoodMenus.
4. Square Catalog.
5. Toast Menus V3.
6. Clover Inventory.
7. Flipdish Menu Management V3.
8. GloriaFood Menu API and shutdown.
9. Slice partner API.
10. Lightspeed K-Series.
11. Tripadvisor Content API.
12. Yext menus, reviews, and photos.

The audit was limited to current official provider or government documentation
available on 2026-07-23. Public restaurant pages and provider endpoints were
not sampled.

## Method

1. Treat every Gemini `Verified` label as unproven because its citation column
   was blank.
2. Look for direct first-party documentation of the capability, access posture,
   image-to-item linkage, author type, cost, quota, and refresh path.
3. Record each claim as Supported, Narrowed/Corrected, or Unverified.
4. Do not infer photo capability from menu capability.
5. Re-rank only when the evidence changes north-star leverage or experiment
   feasibility.

## Baseline

Before this gate, the Gemini report appeared to offer:

- multiple high-value merchant or partner menu-photo APIs;
- Yext and Tripadvisor as Customer-photo deal candidates;
- Riverside County DEH as an immediately usable Temecula census frame; and
- a claimed GloriaFood extraction opportunity ending in April 2027.

None of those claims had a usable citation, sample, or measured incremental
comparison result.

## Claim Ledger

| Claim | Primary-source result | Decision |
|---|---|---|
| Overture is an open monthly identity frame with stable GERS IDs | Supported. Overture documents monthly reference-map releases, stable GERS IDs, GeoParquet on AWS/Azure, a Places operating-status field, and per-source licensing. The Gemini matrix's single-license shorthand was too broad. | Keep as a bounded identity input; coverage remains unmeasured. |
| Riverside County DEH is a real-time, unmetered bulk census source | Narrowed. The county documents inspection-report search and 60-day closure/downgrade lists. No stable city-bounded bulk list of all active food facilities was found in this audit. | Do not qualify it as the DL-002 frame yet. Check for a documented export or public-record snapshot. |
| Google Business Profile exposes structured menu items and item photos | Supported as a capability. Official FoodMenus docs show get/update methods, item-level `mediaKeys`, and `business.manage` OAuth. API access itself is reviewed. Merchant population and media retrieval/display rules remain unknown. | Keep as permission-gated DL-010 after baseline. |
| Square Catalog gives item-linked images and has a sandbox | Supported. Official docs show item/variation `image_ids`, `CatalogImage.url`, related-object retrieval, and sandbox endpoints. | Keep; schema fixture is safe, live value requires merchant OAuth and measurement. |
| Toast V3 is an ordering-partner menu feed with channel filtering | Supported. Toast documents `menus.channel:read`, ordering-partner-only access, partner-token filtering, and a rate of one request per second per location. The checked pages did not establish image fields or SeeFood partner eligibility. | Keep as a high-value partnership opportunity, not a ready connector. |
| Clover Inventory exposes menu items and attached images | Corrected. Clover documents sandbox, OAuth, Inventory Read, items, categories, modifier groups, and review. Its current item schema and allowed expansions do not document an image field. | Lower north-star priority until Clover documents a media path. |
| Flipdish V3 exposes item images and freshness events | Supported with caveats. The Menu Management V3 schema includes item UUIDs and `imageUrl`; OAuth app access and nested modifiers are documented. The menu API is beta. `menu.published.v1` is closed beta/on request. | Select as the best evidenced newer provider for DL-003, permission-gated after baseline. |
| GloriaFood has a menu API and shuts down in April 2027 | Capability supported; date corrected. GloriaFood officially describes a restaurant menu API. Oracle says full service ends March 31, 2027 and new signups are closed. The claimed key workflow and image payload were not verified here. | Add urgent, existing-merchant-only DL-009. |
| Slice offers a partner shop/menu API with detailed pizza/image schemas | Partly supported. Slice's official portal requires partner credentials and says integrations import shop and menu data. The public page checked did not substantiate item images, fractional-modifier structure, merchant count, or pricing. | Retain as an opportunity but require schema evidence before a deal brief. |
| Lightspeed K-Series provides merchant OAuth, item/menu data, and item images | Partly supported. Official docs show OAuth, client scopes, demo/prod environments, Items/Rich Item APIs, menus, and modifiers. The claimed image field, image limits, and universal eligibility were not found. | Retain menu potential; do not claim Management-photo leverage yet. |
| Tripadvisor photos require a bespoke B2B deal | Corrected. Tripadvisor advertises a self-service pay-as-you-go Content API with reviews and up to two photos per location, the first 5,000 calls per month free, a required billing card, daily budget controls, and attribution. Official partner FAQs identify Management photos by author name. Exact dish linkage is not documented. | Keep a tightly capped Customer-photo candidate, but require Kyle's billing approval and a blind item/provenance audit. |
| Yext combines item-linked menus and Customer review photos | Half supported. Official ECL docs show item-linked menu photos. Current Yext Reviews and Reviews Streams schemas show review text and author fields but no photo field. | Keep Management-menu potential; remove Yext as a Customer-photo solution until direct official evidence appears. |

## Primary Sources

### Identity And Census

- [Overture GERS documentation](https://docs.overturemaps.org/gers/)
- [Overture catalog and monthly cloud releases](https://docs.overturemaps.org/getting-data/cloud-sources/)
- [Overture Places guide and current source licenses](https://docs.overturemaps.org/guides/places/)
- [Overture operating-status schema](https://docs.overturemaps.org/schema/reference/places/types/operating_status/)
- [Riverside County DEH home, inspection search, and 60-day lists](https://rivcoeh.org/)

### Management Menu And Photo Paths

- [Google Business Profile `getFoodMenus`](https://developers.google.com/my-business/reference/rest/v4/accounts.locations/getFoodMenus)
- [Google Business Profile FoodMenus schema](https://developers.google.com/my-business/reference/rest/v4/FoodMenus)
- [Google Business Profile API access FAQ](https://developers.google.com/my-business/content/faq)
- [Square CatalogImage](https://developer.squareup.com/reference/square/objects/CatalogImage)
- [Square attached-image retrieval](https://developer.squareup.com/docs/catalog-api/cookbook/create-catalog-image)
- [Toast V2/V3 comparison and access](https://doc.toasttab.com/doc/devguide/apiComparingMenusAPIV2AndV3.html)
- [Toast API change log and Menus V3 rate](https://doc.toasttab.com/doc/relnotes/devPortalApiChangeLog.html)
- [Clover inventory item endpoint](https://docs.clover.com/dev/reference/inventorygetitems)
- [Clover permissions and app review](https://docs.clover.com/dev/docs/gdp-set-app-permissions)
- [Flipdish Menu Structure V3](https://developers.flipdish.com/docs/menu-structure-v3)
- [Flipdish Menu API overview](https://developers.flipdish.com/docs/api-overview)
- [Flipdish `menu.published.v1`](https://developers.flipdish.com/reference/post_menu-published-v1)
- [GloriaFood restaurant menu API](https://www.gloriafood.com/restaurant-ordering-system-with-food-ordering-api)
- [Oracle GloriaFood discontinuation](https://www.oracle.com/food-beverage/)
- [Slice partner API portal](https://developer.slicelife.com/)
- [Lightspeed K-Series authentication](https://api-portal.lsk.lightspeed.app/guides/tutorials/authentication-tutorial)
- [Lightspeed K-Series scopes](https://api-portal.lsk.lightspeed.app/quick-start/authentication/access-scopes)
- [Lightspeed K-Series API index](https://api-portal.lsk.lightspeed.app/quick-start/important-links)

### Customer And Mixed Photo Candidates

- [Tripadvisor Content API product and pricing posture](https://www.tripadvisor.com/business/solutions/hotels/content-api)
- [Tripadvisor developer capability summary](https://developer-tripadvisor.com/)
- [Tripadvisor partner photo-author FAQ](https://developer-tripadvisor.com/partner/faq/index.html)
- [Yext menu ECL schema](https://hitchhikers.yext.com/publisherapis/publishereclapi)
- [Yext Reviews Streams fields](https://hitchhikers.yext.com/docs/streams/reviews-source/)
- [Yext Reviews webhook schema](https://hitchhikers.yext.com/docs/managementapis/webhooks/reviews/)

## Result

The hypothesis was supported.

- Eight capabilities were strong enough to retain: Overture/GERS, Google
  FoodMenus, Square Catalog images, Toast V3, Flipdish V3, GloriaFood Menu API,
  Slice's partner shop/menu API, and Tripadvisor Content API.
- Eight material statements were narrowed or corrected: Overture licensing,
  Riverside bulk availability, GloriaFood's date and key mechanics, Clover
  images, Yext Customer photos, Slice's detailed photo/modifier claims,
  Lightspeed images, and Tripadvisor's access posture.
- Lightspeed remained a menu opportunity but did not earn item-photo credit.
- No external automatic source was verified to provide both strong Customer
  provenance and exact current-menu item linkage.
- No candidate produced verified SeeFood coverage, comparison dishes, cost per
  covered restaurant, or repeatability.

The resulting ranking change is deliberate: DL-004, which tries to recover
strong matches from SeeFood's existing Customer/Unknown supply, now precedes
new Management-only connectors. Flipdish is the first selected newer provider
after the baseline. Tripadvisor is a decision-gated Customer-photo experiment,
not a committed deal.

Incremental restaurants, menus, matched photos, comparison dishes, and verified
coverage: zero.

Runtime was bounded documentation review. Money and paid quota: $0.

## Independent Verification

No connector was implemented, so there was no implementation worker evaluating
its own output. The Lead evaluated Gemini's external claims against provider
and government documentation. A separate Adversarial Verifier then reviewed
this record, the source registry, experiment queue, deal backlog, status, and
access policy without editing them.

The verifier agreed that the claim ledger was conservative and that zero
coverage gain was the correct result. It required four control corrections
before completion:

1. full permission briefs for each High-value permission candidate;
2. an explicit statement that Tripadvisor account creation and billing can be
   performed only by Kyle or the main SeeFood thread;
3. moving the safe Customer-contribution audit ahead of Management-only work
   and adding Square to the queue; and
4. recording this independent review.

Those corrections are now present in `DEAL_BACKLOG.md` and
`EXPERIMENT_QUEUE.md`. The Benchmark Guardian must independently score all real
samples in DL-001 and later source experiments; documentation alone cannot
verify coverage. On re-review, the verifier also required each permission brief
to state its pilot service-level expectation. The briefs now request no SLA and
instead require latency, failure, and repeat-availability measurements. The
verifier then returned **Go** with no remaining blocker.

## Decision

**Revise.**

Keep the supported opportunity set, correct the overclaims, and do not accept
Gemini's source-level `Verified` labels without primary citations and measured
samples.

## Access Action

- **Lab-safe when reached in the one-at-a-time queue:** bounded local Overture
  snapshot, Square schema fixture, and documentation/schema fixtures that
  require no account or paid quota.
- **Pursue permission:** Flipdish, Google Business Profile, and an existing
  GloriaFood merchant after the baseline.
- **Pursue a commercial/technology partnership:** Toast only after image schema,
  eligibility, and economics are clearer.
- **Needs Kyle decision:** Tripadvisor, because signup requires billing details
  even though the first 5,000 calls per month are advertised as free.
- **Monitor:** Clover, Slice, Lightspeed, and Yext until their missing
  photo-specific evidence is supplied.

## Plain-English Meaning

Gemini found real doors, but it also painted handles on a few walls. The best
documented new Management-photo door is Flipdish. Google Business Profile and
Square are also real. The supposed Yext Customer-photo shortcut is not present
in the documented review API, and Clover does not currently document item
images. The Customer side of SeeFood's comparison pair is still the binding
problem.

## Post-Record Correction — 2026-07-23

After this experiment was committed, Kyle asked specifically whether
Tripadvisor photo captions or linked comments could support menu matching. A
new primary-source check found a materially newer product surface:

- [Tripadvisor Terra overview](https://docs.terra.tripadvisor.com/docs/overview)
  says the platform covers restaurants and delivers reviews and photos through
  tiered APIs or feeds.
- [Terra Location Reviews](https://docs.terra.tripadvisor.com/reference/locationreviewsget)
  describes restaurant/location reviews with titles, bodies, photos, and
  reviewer details.
- The legacy [PhotoList Mega Feed](https://developer-tripadvisor.com/partner/mega-feeds/photolist-mega-feed/index.html)
  documents caption, author, photo ID, and review ID fields, while the
  [partner portal](https://developer-tripadvisor.com/partner/index.html) says
  those legacy products are migrating to Terra.
- Tripadvisor's published [Master Terms](https://developer-tripadvisor.com/partner/master-partnerships-terms-and-conditions/index.html)
  restrict AI/ML and algorithmic use, derivatives, combining licensed content
  with other content, selective display, and caching unless an applicable
  Order changes the rights.

The earlier self-service two-photo response is not dispositive for the newer
Terra path. This does not verify that current restaurant contracts expose
captions or review IDs, that SeeFood may retain or display the content, or that
national depth and pricing are viable. Without explicit written exceptions for
matching and paired display, the path is unusable despite its technical
promise. Prompt 2 now treats Tripadvisor Terra as a top research lead with a
hard rights gate.

## Next Action

Run DL-001 exactly as queued. After DL-002 freezes the baseline and cohorts,
test whether SeeFood's existing Customer/Unknown photos can be strongly
recovered before spending effort on another Management-only connector.
