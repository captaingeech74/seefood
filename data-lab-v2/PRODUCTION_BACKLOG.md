# DataLab 2.0 Production Backlog

This backlog is implementation order, not permission to deploy from the lab.
Each release is reversible and starts in shadow/review mode.

## P0 — Build now

1. **Source-neutral identity store and monthly Overture loader**
   - Tables: internal restaurant entity, source identity, field observation,
     import batch, match proposal, review decision.
   - Preserve supplier ID, release/version, address, coordinates, website,
     phone, status, lineage, first/last observed, and raw-record hash.
   - Idempotent reruns; batch rollback/deactivation; schema/count drift checks.
   - Exit: representative labeled rollout reaches 99% location precision before
     new entities publish automatically. Until then, queue all additions.

2. **Deterministic association and quarantine service**
   - Port Cycle 2 domain, phone, street, name, and distance evidence rules.
   - Quarantine equal-best candidates, chain-domain-only links, co-locations,
     omissions, website conflicts, duplicate merges, and every status change.
   - Emit reason codes and immutable evidence; never merge destructively.
   - Exit: 7/7 recovery fixture and 4/4 omission-preservation fixture remain
     green, plus production-scale labels clear the publication threshold.

3. **Bounded website menu connector**
   - One homepage request and at most one strict menu/order link; parse
     schema.org and client-visible JSON; record platform and observation time.
   - Store menu/category/item source records separately from canonical dishes.
   - No generic image download and no status inference from reachability.
   - Exit: parser fixtures are idempotent and a larger rollout confirms at
     least 95% item linkage; otherwise keep review-only.

4. **Provider identity proposal ingest**
   - Load public DoorDash sitemap matches as review proposals, never authority.
   - Preserve provider store URL/ID hash, match evidence, ambiguity, and date.
   - Do not add Grubhub browser-search automation to production.

5. **Shared source safety controls**
   - Per-source snapshots and last-seen state; empty/failed runs cannot retire
     good rows; three successful omissions before reviewable retirement.
   - Exact-byte SHA-256 identity, perceptual hash for audit only, provenance and
     all item/photo links, bounded downloads, MIME/decode/size checks.
   - Metrics: attempted/safe identities, menus, items, linked photos, unique
     URLs/hashes, duplicate inflation, failures, latency, and review outcomes.

## P1 — Negotiate and pilot

6. **DoorDash sanctioned-feed evaluation**
   - Owner: partnerships/data acquisition plus legal and engineering.
   - Ask: US locations and daily menu/photo deltas with the fields, rights,
     attribution, retention/deletion, SLA, and pricing in
     `FINAL_RECOMMENDATIONS.md`.
   - Pilot on the six-market graph; compare against 328/1,238 discovery matches
     and separately label chain/independent and unmatched lift.
   - Go only if identity precision is at least 99%, item linkage at least 95%,
     rights cover production photo delivery, and cost per incremental usable
     item/photo fits the product budget.

7. **Grubhub sanctioned-feed evaluation**
   - Same required fields and rights as DoorDash; insist on a bounded roster
     first because fresh strict discovery was 0/12.
   - Test whether the prior 325-item/149-photo density persists beyond the two
     accepted pilots and whether the wrong-location negative case is prevented.
   - Stop if the six-market sample has sparse incremental store reach or cannot
     meet the identity/linkage thresholds without manual search.

8. **ChowNow exploratory sample**
   - Ask for stable location/menu/item IDs, daily deltas, images, and production
     reuse rights. Commit only after multi-market incremental yield materially
     exceeds the generic website connector's one 37-item success.

## P2 — Validate before automation

9. Label a rollout batch spanning regions and chains/independents; estimate
   identity precision, item linkage, status correctness, incremental menus and
   unique byte-verified photos with explicit denominators.
10. Add reviewer tooling for match evidence, source conflicts, status changes,
    omissions, merges, and reversible batch rollback.
11. Monitor monthly release freshness, provider delta lag, schema drift,
    source-specific disappearance, photo decode failures, and duplicate rates.

## Explicitly not in backlog

No DoorDash/Grubhub browser farm, national Overpass dependency, second external
backbone, automatic closure from page failure, generic website image crawler,
standalone Toast/Square/SpotHopper connector, paid commercial roster purchase,
county-by-county acquisition engine, ghost-kitchen classifier, or opening-date
research.
