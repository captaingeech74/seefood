# Structured menu platforms: proposed enrichment plan

September 20, 2026. Approved by Kyle; execution is managed by the main lead with
a Sol medium subagent handling extraction and the bounded platform pilot.

## Goal

The winning principle is **reliable dish-to-photo connections, regardless of
provider**. Repeat the Rainbow Oaks experience throughout our existing cities:
more real dishes with useful, correctly attached photos. Structured platforms
are a priority source, alongside delivery menus, ordinary websites, PDFs,
galleries, and customer contributions.

## What we know

- The September 19 database audit verified Rainbow Oaks has 159 active menu
  items and 69 unique photos attached to 69 dishes. All 69 photo origins are
  on Popmenu's image host. This came through the existing V3 collector plus a
  scoped repair/publication script, not a bespoke visual-matching model.
- Three other concrete examples are Carlsbad French Pastry Cafe (35), The
  Naked Cafe (34), and Casero Taqueria (34): each count is live, menu-linked
  Popmenu photos.
- V3 results detect 360 entities on structured platforms, 359 currently live;
  174 live entities have no useful active photo, and 242 have fewer than ten.
  These are opportunities, not promised gains. Platform detection can be a
  link rather than an extracted menu; duplicate identities also need resolution.
- The 17 detected Popmenu entities exclude Rainbow Oaks' scoped repair; eight
  currently have zero useful photos. Some already have staged linked-photo
  candidates. Neither count is an exhaustive provider census.
- The code detects 14 platforms. Many share generic embedded-JSON extraction;
  a recognized platform is not equivalent to a tested, complete integration.

## Initial provider map

Order below is a starting hypothesis, adjusted by local presence and measured
incremental yield. These are practical groups, not verified market-share tiers.

| Group | Providers | What to learn |
| --- | --- | --- |
| Photo-menu and restaurant websites | Popmenu, SpotHopper, Owner, BentoBox | Which templates expose explicit dish photos; where ordering is hosted elsewhere; menu tabs and location scopes |
| Broad ordering/POS systems | Toast, Square, ChowNow, Clover, Olo, Menufy/HungerRush | Location-specific item IDs, photos, descriptions, menu schedules, and public storefront access |
| Specialist and midsize systems already recognized | Slice, Flipdish, Lightspeed, GloriaFood | Presence in our cities and whether a focused adapter yields enough useful photos |
| Gaps to investigate | Wix Restaurants, SpotOn, Zuppler, TouchBistro, MenuDrive | Detect actual local examples; establish public extraction feasibility before building adapters |
| Additional menu and regional discovery | SinglePlatform, iMenuPro, MustHaveMenus, and providers encountered on Cabo/resort/Spanish-language sites | Useful menu text versus actual restaurant photos; identify regional platforms through local evidence |

Provider names change and corporate ownership does not define technical
compatibility. Inventory storefront versions and embedded ordering providers,
not just company names. Ordinary Squarespace/WordPress sites stay eligible too.

## Proposed execution

### 1. Map the opportunity in our existing cities

Refresh the baseline for Temecula and nearby live venues, existing San Diego
coverage including Carlsbad, Spokane, and Cabo. Do not imply the entire San
Diego metro has been processed. Include one-off live restaurants such as Rainbow
Oaks regardless of acquisition-market boundaries.

Use saved evidence first; inspect official websites, menu/order links, embedded
frames, public storefronts, and relevant search results for missing providers.
Discover platforms on custom domains and multiple providers at one restaurant.
Include newly found legitimate local restaurants through normal identity
resolution; do not turn this into an unrestricted national expansion.

Produce one compact register: platform/version, local restaurant count, current
coverage gap, known extractor, public access path, likely value, and next action.
Mark providers with no local evidence as watchlist instead of building for them.

### 2. Run a bounded pilot and fix reusable gaps

Start with Popmenu, then other platforms with the largest local opportunity.
Test roughly 3–5 varied restaurants per priority platform, using all available
examples when fewer exist. Target about 30–40 restaurants in the first pilot,
including empty, thin, rich, and multi-location examples. Use Rainbow Oaks as a
regression reference. This is a practical development batch, not an estimate
of national accuracy.

For each example compare what a diner can see on the source menu with what our
collector finds and what SeeFood displays. Check breakfast/dinner tabs, linked
ordering domains, pagination, variants, and named photos. Read public structured
payloads and stable item IDs when available; browser rendering is a fallback.
Use a small provider-specific adapter only when it fixes a repeated gap.

Test known failure modes: wrong branch, modifiers becoming dishes, catering
mixed into dine-in menus, generic category photos, repeated placeholders,
stock/decorative imagery, and unavailable ordering being mistaken for no menu.
Direct dish attachment is strong evidence, but does not prove every supplied
image depicts the restaurant's actual food. Retain useful real food that lacks
a safe dish match at restaurant level rather than inventing a match.

Checkpoint 1: record working providers, recovered dish photos, failure causes,
and which adapters merit rollout. Routine choices are managed by the lead;
only a material change in scope/cost requires Kyle's decision.

### 3. Harvest proven routes across the current footprint

Prioritize zero-photo restaurants, then thin restaurants, with strong attention
to sit-down venues where visual dish choice is valuable. Also fill obvious
missing dishes at otherwise rich restaurants. Rank by expected useful gains
and effort, not provider size or a complicated scoring system.

Process bounded, resumable batches. Reuse the current identity, extraction,
asset verification, deduplication, provenance, and publication pipeline. Add
missing dishes/photos while preserving existing good data and original source
links. Confirm location applicability before reusing any chain menu evidence.
No paid services or new provider contracts in the initial pass; record concrete
access or agreement needs only when they block meaningful value.

Checkpoint 2: inspect the first expanded batch in the live app, compare net
gains and errors, then continue working providers through the remaining cities.
An unreliable provider pauses for repair without blocking unrelated providers.

### 4. Make the result durable and finish

Close the execution gap: discovered website -> attempted menu collection ->
verified assets -> eligible publication -> visible dishes. Every unresolved
restaurant has a concrete reason, such as no source photos, inaccessible
menu, ambiguous location, unsupported template, or pending technical repair.
Do not leave a successful extraction silently stranded in staging.

Add lightweight refreshes using existing operational machinery, prioritizing
changed/stale menus. Preserve good data through transient fetch failures and
use existing confirmed-absence rules. No permanent research laboratory.

Finish when the discovered, accessible platform routes in our cities have been
attempted, supported recoverable evidence is live, and remaining gaps have
specific reasons. Time-box low-yield providers after representative failures;
do not chase every vendor or promise photos that restaurants never published.

## Simple report and success criteria

Per city and provider: restaurants identified, attempted, successfully extracted,
improved in the live product, newly given their first photo, and newly given
ten or more distinct pictured dishes. Also report new distinct dishes with
photos, visible-source photos recovered versus missed in the audited sample,
cost, and meaningful remaining blockers.

Ten pictured dishes is a depth indicator, not a publication threshold or a
universal definition of quality. Count unique dish/photo gains after duplicates
and overlap with other sources. Existing menu/photos must not be lost; wrong
restaurant or dish attachments found in QA must be corrected before expanding
that adapter. Crawl counts alone are not success. Forecast numerical gains only
after the pilot establishes real yield.

## Research informing this proposal

Official sources checked September 20, 2026; product support is not proof of
public API access or actual photo presence at a particular restaurant.

- [Popmenu interactive menus](https://get.popmenu.com/solutions/full-menu): explicit dish presentation is a strong fit, supported by our live examples.
- [Toast item images](https://support.toasttab.com/en/article/How-to-Add-Images-to-an-Online-Ordering-Menu): images attach to online menu items.
- [Square catalog images](https://developer.squareup.com/reference/square/objects/CatalogImage): images can attach to items, variants, categories, and modifiers; distinguish these relationships.
- [ChowNow menu photos](https://get.chownow.com/restaurant-support/how-do-i-remove-or-edit-replace-a-menu-photo/): item-photo management and crops require variant handling.
- [SpotHopper menus](https://howto.spothopperapp.com/knowledge/menus): structured menus and printable versions coexist.
- [BentoBox ordering](https://www.getbento.com/blog/online-ordering-new-features/), [Owner](https://www.owner.com/), [Olo](https://www.olo.com/), [Clover](https://www.clover.com/pos-systems/online-ordering), and [HungerRush](https://www.hungerrush.com/): investigate the actual local storefront, not just marketing claims.
- [Wix restaurant menus](https://support.wix.com/en/article/wix-restaurants-customizing-the-look-of-wix-restaurants-menus-new): supports dish images but also repeated placeholder images, an important false-match trap.
- [SpotOn](https://www.spoton.com/solutions/online-ordering/) and [TouchBistro](https://www.touchbistro.com/online-ordering/): additional restaurant ordering surfaces to inventory locally.
- [Zuppler visual menus](https://www.zuppler.com/demo) versus [standard text menus](https://help.zuppler.com/portal/en/kb/articles/standard-online-ordering): different products from one provider can have very different photo yield.
- [Flipdish menu tools](https://help.flipdish.com/en/collections/10069664-menu): account for menu versions and image relationships.
- [GloriaFood service notice](https://www.gloriafood.com/): announced end of life April 30, 2027. Preserve inexpensive existing extraction; avoid major investment in a retiring integration and identify actual replacement links when sites migrate.
- [SinglePlatform menu widget](https://docs.singleplatform.com/menu_widget/), [iMenuPro image tools](https://help.imenupro.com/design/images/), and [MustHaveMenus](https://www.musthavemenus.com/feature/menus.html): menu presence is useful but decorative/stock imagery must not become a claimed dish photograph.
