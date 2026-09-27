# Structured capture: all live cities and future cities

September 27, 2026. The shared V3 extractor already contained the September 21
improvements. The missing operational piece was discovery/refresh beyond the
26 hand-reviewed successful routes. That fixed list is now a supplement, not
the boundary of acquisition.

## Operational rule

`npm run acquisition:structured-rollout -- --publish` reads active websites
attached to live restaurant entities, without a city allowlist. Newly published
restaurants in any city become eligible automatically. Unlaunched candidate
rosters are not silently promoted or crawled. The existing nightly Mac job
runs up to 60 routes, with three workers and serialization per domain; four
pages per route. No paid fetcher or paid model is enabled.

New routes go first. Detected platform routes refresh after 30 days, ordinary
sites after 90, failures after seven. The prior 2,307-URL discovery and 526-route
extraction are reused as dated attempt evidence, not counted as new captures.
State and per-route results live in ignored `logs/structured-platform-rollout`.
The Mac must be available for the nightly job. This is not cloud-always-on.

HTTP 401/403/429 are access restrictions, not evidence of an empty menu, and
receive the shorter retry. A previously detected platform remains on the
monthly schedule even if a subsequent response omits its platform signature.

## Publication

Reviewed routes retain their explicit method/page restrictions. New routes can
publish automatically only when the exact evidence page declares one restaurant
with matching name, full street, and locality in structured metadata, and the
photo is explicitly attached to a structured dish. Multi-location directories,
unproven identities and generic galleries stay staged; they are not discarded
or advertised as live gains. This conservative automatic lane supplements the
existing website/PDF/gallery/merchant/customer pipelines, not replaces them.

All writes reuse the additive publisher, image-byte checks, placeholder
rejection, provider-size dedupe, provenance and preimage journals. An incomplete
fetch cannot remove a good dish/photo. An interrupted publication stops for
inspection. A local lock prevents overlapping rollout processes.

Useful unmatched food remains valuable; this narrow automatic menu lane does
not apply a new ban on restaurant-level food photography.

## Commands

- `npm run acquisition:structured-rollout -- --plan`: current scope/backlog,
  no fetching or publication, no state changes.
- `npm run acquisition:structured-rollout -- --limit=10`: collect a bounded
  preview with no production writes or successful-attempt state changes.
- `npm run acquisition:structured-rollout -- --publish --market=spokane-wa`:
  additive scoped execution. Omit market for all live cities.
- `--entity=UUID --force --limit=1`: scoped diagnostic rerun. Never use force
  as the nightly default.

Future-city onboarding: register identity/boundary, resolve duplicate locations,
attach websites, publish legitimate restaurant identities, then run this same
command scoped to the market. Check live pictured-dish gains, not fetched links.
No city-specific collector fork or hand-maintained restaurant list is needed.

## September 27 baseline and LA decision

2,371 live entities; 699 have usable photos; 355 have ten directly pictured
dishes. All current website URLs were present in the previous discovery pass.
The scheduler sees 2,506 entity/website pairs (shared URLs count per entity),
with 349 due for retry/collection at bootstrap. These are not 349 new sources.
Markets include Temecula, Carlsbad, Spokane, Los Cabos and the existing San Diego
subset, plus live venues outside managed markets. San Diego/Cabo candidate
rosters are not falsely described as fully enriched live coverage.

LA has no registered acquisition market in the measured portfolio. The tooling
is suitable to begin a bounded LA neighborhood pilot; it is not evidence of a
completed, quality-checked LA rollout. Before a city-wide launch claim, establish
the footprint and roster, run acquisition/publication, and verify nearby
restaurant recognition and useful pictured-dish coverage across neighborhoods.
At current coverage depth, improving high-use empty/thin venues is the strongest
next product investment. Do not gate individual real restaurants out of the map
because they are sparse.

Rollback code tag: `rollback/pre-citywide-structured-rollout-20260927`.
Disable only the new wrapper invocation to stop future rollout work; existing
data remains. Production mutations, if any, retain publisher preimages/journals.

Verification: 192 tests pass, TypeScript and production build pass; live phone
and desktop checks show Penfold's, Gregorio's and Logan Tavern remain functional.
