# Restaurant publication policy

Updated August 8, 2026.

## Early-market macro policy

Show every confidently real restaurant unless it is known permanently closed,
rejected, quarantined, or a confirmed duplicate. Content readiness changes its
ranking and visual treatment; it does not determine whether the restaurant
exists in the product.

This is intentionally expansive. SeeFood will observe real crowding and usage
before inventing a scarcity policy. At neighborhood zoom every restaurant is an
individual pin. When more than 120 restaurants occupy one viewport, the map
clusters them rather than silently dropping records.

## On-site rule

The GPS-first opening is the primary product moment. The app selects the nearest
published restaurant only inside a tight, phone-accuracy-aware radius of
120–350 meters. An empty restaurant is still eligible. A restaurant several
blocks away is not silently presented as the diner's current venue.

## Readiness treatment

- `rich`: current menu plus at least seven distinct displayable photographed dishes.
- `partial`: a current menu or at least one displayable photographed dish.
- `shell`: verified restaurant identity without either form of useful content.

Rich restaurants receive photo pins when possible. Partial restaurants receive
ordinary pins. Shells receive outline-plus pins and a prominent invitation to
add the first dish. Exact name search may return every published tier.

## Identity

Existing Google Place IDs are preserved. A restaurant without Google receives a
stable `seefood:<entity-uuid>` product ID while its Overture, OSM, website, and
future Google/provider identities remain attached to the SeeFood-owned entity.
Internal IDs must never be written back as fake Google identities.

## Operations and rollback

Preview:

```bash
npm run market:publish -- --market temecula-ca
```

Publish:

```bash
npm run market:publish -- --market temecula-ca --publish
```

Rollback:

```bash
npm run market:publish -- --rollback <run-id>
```

Every changed entity is recorded in `market_publication_actions`. Rollback
marks newly exposed rows inactive and restores prior entity status without
deleting restaurant, menu, photo, provenance, or contribution data.

## Founder-facing reporting

Normal market reporting uses four numbers:

1. Verified restaurants: real and not known closed.
2. Live restaurants: visible in SeeFood.
3. Strong restaurants: menu plus seven photographed dishes.
4. Neighborhood availability: known restaurant locations with at least five
   live choices inside 1.5 km.

Technical acquisition, source, menu, photo, and comparison funnels remain one
click deeper for diagnosis.
