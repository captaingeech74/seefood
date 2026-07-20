# Data Acquisition Backlog

These concepts are intentionally specified but not implemented in the July 2026 acquisition build.

## Chain Catalog Strike Team

**Goal:** turn one high-quality national or regional chain catalog into reusable menu coverage for every confirmed location.

1. Maintain a ranked queue of chains by US location count, current SeeFood location count, and menu/photo completeness.
2. Build one tested adapter per chain's canonical menu, ordering endpoint, or structured site data.
3. Normalize the catalog into `brand_menu_templates`; never duplicate the same national menu independently at every location.
4. Attach locations through `restaurant_brand_memberships`, with confidence and a human confirmation path.
5. Store location exceptions in `location_menu_overrides` for unavailable, renamed, or locally priced items.
6. Measure each adapter by locations upgraded, menu items gained, photos gained, and comparison-ready dishes created.

The first implementation should be an operator workflow, not a generic autonomous crawler: pick one chain, inspect its real data shape, build the adapter, verify ten geographically varied locations, then expand.

## Merchant Social Import

**Goal:** let a verified merchant deliberately contribute food photography they already control on Instagram, Facebook, or TikTok.

1. Start inside an approved merchant claim and use official provider authorization.
2. Show a selectable gallery; never import an account wholesale by default.
3. Ask the merchant to match each selected image to an existing dish or create a menu item.
4. Preserve post URL, provider, account ID, caption, timestamp, authorization evidence, and the importing merchant connection.
5. Store the resulting photo as management-provided and keep the social origin visible in provenance.
6. Deduplicate against existing photos before copying bytes or creating a photo row.
7. Revoke future access when authorization is removed; retain previously imported records according to the merchant agreement.

Success is measured by verified management photos matched to menu items, not by raw social posts copied.
