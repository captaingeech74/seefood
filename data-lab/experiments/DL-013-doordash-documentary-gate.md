# DL-013 — DoorDash Documentary And Technical Gate

## Decision

**Revise. The standard authorized connector is not a national acquisition
path. Preserve both a bespoke-data opportunity and a separate, high-potential
scraping hypothesis.**

DoorDash passes the technical-value and broad-geography gates. It fails the
current-access, rights, and measured national-yield gates. Building or scaling
a public-page connector is not yet justified, but its possible technical yield
has not been falsified.

## Hypothesis

An authorized DoorDash catalog/data path can add at least 20 percentage points
of national current-menu-plus-strong-Management-photo coverage.

This is a national hypothesis. Temecula is only a validation slice.

## Preregistered Gate And Bound

The documentary stage had to establish:

1. a documented read path containing stable store, menu, item, and image data;
2. a credible path across a nationally broad restaurant population;
3. a permission model compatible with SeeFood;
4. a plausible path to retention, display, matching, combination with
   separately cleared Customer photos, refresh, and deletion; and
5. enough evidence to justify an authorized 30-restaurant / 300-image pilot.

The stage allowed first-party public documentation, existing repository
history, the frozen DL-002 evidence, and one bounded read of DoorDash's public
store-sitemap index. It prohibited store-page crawling, authentication,
account creation, hidden-holdout disclosure, paid calls, vendor outreach, and
production writes.

## What Was Tested

### Existing measured quality

DL-002 contained a selected, non-representative DoorDash evidence packet:

- 168/168 rendered records were exact item matches;
- 164/168 were useful food images; and
- 168/168 were classified as Management because they came through a
  management-catalog source. Original merchant/POS/controller authorship was
  not verified, and every rights status remained unreviewed.

This is unusually strong payload-quality evidence. It does not measure the
share of restaurants DoorDash can supply, image population, freshness,
downstream rights, or incremental national coverage.

### Documented menu and image schema

DoorDash's [Get DoorDash Menu documentation](https://developer.doordash.com/en-US/docs/marketplace/how_to/get_doordash_menu/)
confirms that an active OpenAPI integration can retrieve complete active-menu
JSON for stores being onboarded through that integration or already configured
to that provider type. The store must be associated with the partner; this is
not a marketplace-wide export.

DoorDash's [Storefront API](https://developer.doordash.com/en-US/api/storefront/)
documents authenticated, business/store-scoped menu reads containing documented
menu, category, and item identifiers, names, descriptions, prices, modifiers,
hours, and an item-level `original_image_url` field. Identifier stability and
image population across refreshes were not measured. Public documentation does
not establish a right for SeeFood to enumerate unrelated Marketplace
merchants.

DoorDash's [integrated-image documentation](https://developer.doordash.com/en-US/docs/marketplace/how_to/integrated_images/)
confirms that item images can arrive directly from a merchant's POS and remain
linked at item level after DoorDash review. DoorDash's
[photo-quality rules](https://help.doordash.com/en-us/merchants/article/common-rejection-reasons)
require representative, item-specific images and clear rights. They also say
some DoorDash-added photos may come from Instagram or Yelp. Therefore
`source=DoorDash` alone does not prove merchant authorship or transferable
rights.

The strongest provenance path is usually the original merchant/POS controller,
not DoorDash's transformed copy.

### Access and rights

DoorDash says its
[Marketplace APIs are approval-only](https://developer.doordash.com/en-US/docs/marketplace/overview/about_marketplace/),
support a limited number of integrations, and are currently at capacity while
self-serve onboarding is developed.

The documented GET-menu path is for merchants associated with an active
integration. It is not a read-only discovery feed for all DoorDash
restaurants. The public
[developer terms](https://developer.doordash.com/en-US/docs/marketplace/overview/terms_of_use/)
do not grant SeeFood production reuse rights. The
[US merchant terms](https://help.doordash.com/en-us/merchants/article/merchant-terms-of-service-us-english-section-1-11)
give DoorDash a limited license to merchant content for DoorDash services and
do not establish SeeFood's right to retain, display, relabel, or combine that
content. DoorDash-originated access or content requires an applicable DoorDash
grant. Direct merchant/POS authorization may be an alternative for original
controller-supplied payloads.

### Geographic footprint

One bounded request fetched DoorDash's public store-sitemap index:

- URL:
  `https://cdn.doordash.com/sitemaps/sitemaps/sitemap-store-doordash-index.xml`
- observed: 2026-07-27 America/Los_Angeles;
- size: 13,915 bytes;
- SHA-256:
  `cac7359828af65416a268ad13db30f31b2cc8e6e68ef166ee7a86e2e09de3dc4`;
- entries included all 50 states, Washington DC, and Puerto Rico.

Reproduce with:

```sh
curl -fsSL --max-time 30 -o data-lab/tmp/DL-013/sitemap-index.xml \
  https://cdn.doordash.com/sitemaps/sitemaps/sitemap-store-doordash-index.xml
node data-lab/scripts/evaluate-dl013-sitemap-index.mjs \
  data-lab/tmp/DL-013/sitemap-index.xml
```

DoorDash also described its Marketplace as having
[more than 500,000 local merchants](https://about.doordash.com/en-us/news/doordash-partners-with-regional-grocers)
in 2024. That count includes grocery, convenience, and retail. It does not
measure unique active restaurant locations or populated item photos.

The footprint is credibly national. The specific +20-point qualified-coverage
claim remains unmeasured.

## Result Against The Gate

| Gate | Result | Evidence |
|---|---|---|
| Menu and item-linkage schema | Pass | Documented menu JSON; DL-002 passed 168/168 selected item matches |
| Image-field capability | Pass with caveat | `original_image_url` is supported, but population per item/location is unmeasured and DoorDash-added photos can have other origins |
| National geographic reach | Pass | Store sitemap index covers every US state plus DC and PR; platform claims 500,000+ local merchants |
| Marketplace-wide authorized read path | Fail | Documented reads are limited to stores attached to the active provider/business integration |
| Current partner availability | Fail | Approval-only; public docs say the integration pipeline is currently at capacity |
| SeeFood retention/display/combination rights | Fail | No public grant; merchant and developer terms are purpose-limited |
| Representative image-populated national yield | Unmeasured | No authorized nationally stratified fixture |
| Refresh/deletion/economics | Unmeasured | Requires a custom terms and schema packet |

## Coverage Impact

Verified SeeFood coverage improvement: **zero**.

The active baseline remains 68/504 restaurants with a claimed current menu and
matched Management photo, including 0/108 in the hidden national holdout. A
20-percentage-point national gain requires at least 22 incremental qualified
restaurants in the 108-record active national holdout. DL-013 produced no
authorized national content fixture, so it cannot claim any of those 22.

## Interpretation

The technical opportunity is real. The standard product is the wrong access
shape for SeeFood: it is an operational integration for a partner's configured
merchants, not national data syndication.

The scraping path is a separate hypothesis and must not be rejected merely
because the standard API path fails. National discovery is solved through the
state sitemap index, current RSC extraction has worked, and the selected
DL-002 packet showed excellent item linkage. In theory, a reliable rendered
fetcher could recover large amounts of current menu text and item-linked
photography. The unresolved ceiling is determined by correct store matching,
successful rendered-page retrieval, item-photo population, refresh stability,
duplicate/ghost/retail filtering, provenance source, and machine cost.

That makes scraping potentially game-changing on the Management side but still
unmeasured. It provides no meaningful Customer-photo solution. Scaling it
today would also require a separate decision because the current DataLab
boundary does not authorize defeating bot controls.

The only DoorDash continuation worth considering is a bespoke read-only
discovery/data agreement. It would need eligible-location counts, full
item-image schema, provenance source, retention/display/matching and
combination rights, deletion signals, refresh terms, and a blinded national
fixture.

## Next Gate

If Kyle authorizes contact, request the existing documentary ask in
`DEAL_BACKLOG.md` before requesting credentials or building anything. The
response must establish:

- whether DoorDash will consider discovery/data use instead of an ordering
  middleware integration;
- eligible US restaurant counts and the fraction with current menus and
  approved item photos;
- whether it distinguishes merchant/POS photos from DoorDash-added Instagram,
  Yelp, stock, or commissioned photos;
- explicit retention, display, derived-label, cross-source combination,
  deletion, and attribution rights; and
- a $0 blinded fixture for the 30-restaurant / 300-image pilot.

If DoorDash will not supply that packet, close the bespoke-data path without
pretending that this falsifies the technical scraping hypothesis. Direct
merchant/POS authorization remains the cleaner-provenance fallback.

## Cost And Safety

- Money: $0.
- External requests: one 13.9 KB public sitemap-index request plus public
  documentation reads.
- Images downloaded: 0.
- Accounts, credentials, outreach, production reads/writes, deploys, and paid
  quota: none.
