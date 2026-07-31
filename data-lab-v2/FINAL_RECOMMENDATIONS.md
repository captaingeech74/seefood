# DataLab 2.0 Final Recommendations

## Final decision

SeeFood should now build the owned identity graph and conservative enrichment
pipeline, then pursue sanctioned delivery-platform feeds for menu photos. It
should not build a national browser-scraping system. The six cycles support a
small source stack: Overture for broad identity, deterministic evidence gates
for reconciliation, restaurant websites for sparse incremental menus, and
commercial delivery feeds only by agreement.

## Ranked source strategy

| Rank | Source/capability | Action | Evidence and expected benefit |
|---:|---|---|---|
| 1 | SeeFood-owned identity graph seeded monthly by Overture | **Implement now, publish through review** | Overture supplied 5,732 restaurants in three Cycle 0 boxes and 1,238 in six Cycle 1 boxes, with address on 1,238/1,238, phone on 1,180, website on 1,088, and status on 948. Selected audits found real website/status contradictions, so new records and mutations remain review-gated. |
| 2 | Deterministic identity, website, duplicate, and status gates | **Implement with review** | The Cycle 2 linker recovered 7/7 reviewed false negatives, retained 4/4 reviewed omissions, and made 0 false links in that 11-row fixture. It proposed 232/619 old unresolved records and quarantined 25; those larger counts are workloads, not measured precision. |
| 3 | One-hop restaurant website/menu collector | **Implement with review** | Cycle 4 found menu surfaces at 9/24 selected restaurants and 37 unique items at 1/24. Five menu surfaces and all 37 items were on DoorDash-unmatched identities. Linked dish-photo yield was 0/37, so build menu discovery/parsing, not image harvesting. |
| 4 | DoorDash location/menu/photo feed | **Negotiate first** | Public sitemaps safely matched 328/1,238 selected Overture identities, including 218 independents, but fresh pages were blocked 12/12. Separate July evidence produced 314 items and 148 new byte-unique photos at two accepted restaurants and records much larger historical yield. |
| 5 | Grubhub location/menu/photo feed | **Negotiate with a sample; no collector expansion** | Fresh rendered searches worked 12/12 but found 0/12 strict target/location matches, so fresh menu/photo yield was zero. Separate July pilots yielded 325 items and 149 unique photos at two accepted stores, while one unsafe alternative created 172 wrong items and 46 wrong photos before reversal. |
| 6 | OSM omission/field signal | **Review-only, defer national ingestion** | Cycle 0 linked 752/1,371 OSM rows and left 619 candidate increments; a selected unresolved audit found 7/15 matcher misses and only 4/15 high-confidence omissions. On accepted overlaps OSM added just 9 websites and 6 phones. Do not use public Overpass as production infrastructure. |
| 7 | ChowNow-specific feed | **Low-priority negotiation** | It produced the only structured website menu: 37 items from 1/2 detected restaurants, with zero item photos. Seek a sample/API only as part of the generic website program, not a standalone integration commitment. |
| 8 | Foursquare/commercial national seed | **Defer** | The Cycle 0 lineage proxy covered only 2,204/5,732 Overture restaurants and was not a standalone product benchmark. No measured gap justifies buying a redundant backbone now. |

These selected-box and selected-target denominators establish technical choices,
not national coverage rates. Production publishing still requires approximately
99% restaurant identity precision and 95% item linkage precision on a larger,
labeled rollout audit.

## What to implement immediately

1. Load each monthly Overture release into source-neutral entities,
   observations, and provider-identity tables. Preserve source IDs, field-level
   provenance, release/version, and reversible import batches.
2. Run the Cycle 2 evidence linker and gates in shadow mode. Accept only strong
   domain/phone/address plus name/location evidence; quarantine ties, status
   changes, omissions, duplicate merges, and website conflicts.
3. Add the Cycle 4 bounded website mix: fetch one homepage, follow at most one
   strict menu/order link, parse schema.org and client-visible JSON, and retain
   URL/provenance and observation time. Items remain review-gated initially.
4. Import DoorDash sitemap identities only as provider-link proposals. Do not
   fetch blocked store pages or treat provider absence/empty responses as
   deletion evidence.
5. Keep exact-byte photo hashes, menu-item associations, per-source snapshots,
   and reversible deactivation. A source may update only its own observations.

## What to negotiate

DoorDash is the first call, Grubhub the second, and ChowNow a smaller exploratory
conversation. For DoorDash and Grubhub request a bounded evaluation extract
before committing: stable restaurant/location IDs, names, full address and
coordinates, operating and availability status, menu/category/item IDs, item
names, descriptions, prices, image URLs or bytes, and update/delete timestamps;
daily full or delta delivery; coverage and SLA documentation; and transparent
pricing.

The agreement must explicitly allow production ingestion, durable derived
identity links, menu storage/display, photo download/storage/delivery,
provenance/attribution display, internal quality review, and documented
correction, retention, and deletion handling. Evaluate the sample against the
same six-market identity graph and require near-99% location precision and at
least 95% item-photo linkage before automatic publication. ChowNow should offer
the same fields/rights, but its one-menu evidence supports only a bounded trial.

## Drop or defer

- Drop national residential-browser or cloud-browser acquisition for DoorDash
  and Grubhub. Blocks, sparse target discovery, UI drift, and identity risk make
  it the wrong production architecture.
- Drop broad restaurant-website photo scraping. Cycle 4 linked zero photos to
  37 items; generic page imagery is not dish evidence.
- Defer Toast, Square, SpotHopper, and other standalone connectors until the
  generic collector measures recurring structured incremental yield.
- Defer a paid commercial roster, OSM as a second backbone, automatic status
  changes, automatic duplicate merges, and automatic publication of omissions.
- Do not build a county-by-county rollout engine, complex probabilistic matcher,
  source-specific identity silos, or exhaustive source marketplace. Ghost-
  kitchen classification and opening-recency research are outside this plan.

## Risks and stop conditions

- Stop an automatic import if a labeled rollout batch misses 99% restaurant
  identity precision or 95% item linkage precision; quarantine it instead.
- Stop or roll back a release on source-schema drift, unexplained record-count
  change, provenance loss, cross-location collision, or non-idempotent rerun.
- Never infer closure from a failed, empty, or blocked fetch. Require explicit
  accepted-identity evidence and review until a broader audit supports more.
- Stop a website/provider connector after a bounded sample shows no recurring
  incremental structured menus or item-linked photos.
- Stop negotiation if the provider cannot grant required menu/photo rights,
  stable IDs/deltas, correction/deletion semantics, or an evaluation sample
  that clears quality and unit-economics thresholds.
