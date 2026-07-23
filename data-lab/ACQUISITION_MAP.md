# Current Acquisition Map

## Scope

Static inventory completed on 2026-07-23 from repository code, committed
benchmark results, and `DECISIONS.md`. It is not a fresh production
measurement.

## End-To-End Map

```text
Identity discovery
  Google Places ─┐
  OpenStreetMap ─┼─> restaurant entity + provider identities
  Overture ──────┘          │
                            v
Menu/photo acquisition
  Google photos + reviews + website
  Restaurant-site pages, schema.org, images, PDFs
  Menufy and ordering-provider pages
  DoorDash local crawler
  Common Crawl archive
  Brand templates
                            │
                            v
Normalization
  menu rows -> canonical dish names
  photos -> source + inferred author + dish link
                            │
                            v
Production corpus
  source snapshots, menus, photos, coverage views

First-party generation
  Management menu capture / publish ─────────────┐
  Customer upload / missing-dish suggestion ────┴─> production corpus
```

All arrows ending in the production corpus are forbidden to the DataLab.

## Path Inventory

| Path | Discovery/fetch/parse | Current persistence | Existing evidence | Lab-safe measurement |
|---|---|---|---|---|
| Google identity | Nearby/Text/Find Place calls in discovery scripts and app flows | Upserts restaurants, entities, identities, and jobs | Primary production identity path | Existing rows may be exported read-only; fresh calls use quota and are not part of DL-001 |
| OpenStreetMap identity | Nominatim + bounded Overpass in `scripts/discover-region.mjs`; name overlap at <=175 m | Writes entities and identities | Implemented; no committed precision audit | Read-only existing identity pairs; matching logic can be fixture-tested |
| Overture identity/websites | Local GeoJSONL import; name overlap at <=150 m | Direct Postgres writes plus website jobs | California importer exists; no committed precision audit | Local sanitized fixture replay only; importer itself is write-capable |
| Google photos/reviews | Place Details, up to the provider's returned photo set; review NLP | Full pipeline writes menus/photos/source snapshots | Google photo cap and multiple pipeline regressions documented | Existing metadata only in DL-001; `/api/dishes` is not lab-safe |
| Gemini photo analysis | Batched food/orderability/name/duplicate/quality classification; OCR for menu photos | Labels and canonical links are persisted | Live fixes documented; no independent strong-match precision audit | Pure fixture replay is safe only with stored responses; fresh model calls consume quota |
| Restaurant websites | Up to 10 linked pages; schema.org items, generic images, PDFs, platform detection | `saveWebsiteIntelligence`, menus, photos, crawl jobs | Bluewater improved 6 to 13 photos historically | Existing metadata and archived fixtures are safe; calling the pipeline can write |
| Menufy/HungerRush | Direct site API; rendered-card fallback; link following | Website pipeline writes menus and management photos | Richie's produced 221 menu items historically | Parser fixtures safe; live fallback can spend up to 20 Scrapfly credits |
| Toast | Link detection; raw embedded extraction; no Scrapfly due cost | Crawler/live pipeline when data exists | Real links observed; direct page blocked/expensive | Detection fixtures only until a bounded local replay is captured |
| Square/ChowNow/Clover/Olo/Popmenu | Raw embedded JSON plus Scrapfly-rendered fallback | Website pipeline | Rendering works historically; item extraction remained unproven on the tested site | Fixtures safe; live render can spend up to 30 Scrapfly credits |
| BentoBox/Owner/SpotHopper/Slice/Flipdish/Lightspeed/GloriaFood | Host detection and generic extraction | Registered as automatic sources | Code and registry exist, but no source-specific live result is documented | Detection/fixture replay only |
| Common Crawl | CDX lookup and ranged WARC fetch in `scripts/backfill-web-data.ts` | Writes website intelligence and menu rows | Implemented after the older benchmark; no committed incremental result | Archived-page parser fixtures are safe; backfill script is production-write capable |
| DoorDash | Public state sitemap for discovery; Camoufox store fetch; RSC/legacy parsers | Crawler writes cache, source menus/photos, source runs | California discovery 4/5 in a small historical check; several format bugs fixed | Sitemap/parser fixtures are safe; crawler is write-capable and CA/Temecula matching is hardcoded |
| Grubhub | Camoufox search/store path | Crawler source path, but registry is paused | 270 zero-yield runs; no restaurant sitemap | Keep paused; fixture analysis only unless a materially changed source justifies a bounded re-test |
| Brand templates | Exact-name brand membership, inherited template, location overrides | Production canonical/menu tables | Implemented; membership confidence is not independently audited | Read-only membership and override audit |
| Management menu capture | Up to 12 page images, Gemini OCR, human confirmation/publish | R2 page upload then menu writes | Product workflow exists | UI/code review and sanitized fixtures only; no lab uploads |
| Merchant provider connections | Google Business, Square, Toast, Clover availability and generic normalizer | Connection/import tables are scaffolded | No live connector route or measured import is present | Static inventory only |
| Merchant social import | Specified in backlog with official authorization and explicit selection | Not implemented | Backlog only | Research gap; no experiment until official access and consent path are known |
| Customer contributions | Direct photo upload and missing-dish suggestion | R2 plus customer/menu rows | Working product routes; no conversion/coverage baseline | Read-only aggregate export only |

## Current Normalization And Matching

- Menu rows are canonicalized primarily by normalized exact name.
- The live Gemini matcher checks at most the first 60 menu items and accepts an
  exact match or a menu item containing the generated label.
- Pre-labeled catalog photos are treated as menu matches and Management photos.
- Google author type is inferred from `html_attributions`.
- SeeFood uploads are Customer photos.
- A comparison flag groups photos by menu item or normalized label and checks
  for both author types.

These are useful production heuristics, not audited benchmark truth.

## Measurement Hazards

1. `coverage_v2_metrics` treats a photo with any canonical dish ID as matched.
   `savePhotos` can create that canonical dish ID from an AI label even when
   the label did not match a known current menu item. Dashboard
   `basicMenuPhotoCoverage`, percentage rungs, and comparison coverage are
   therefore claimed operational metrics, not verified strong matches.
2. The old benchmark measures photo counts and a loose `isMenuMatch` result,
   not Management/Customer pairs, provenance precision, distinct menu coverage,
   or incremental comparison dishes.
3. `scripts/benchmark.mjs` defaults to production and calls `/api/dishes`.
   Cache misses persist to Supabase, and the request omits coordinates and
   address, so it can overwrite stored location data with `0,0` and blank text.
   The current corpus short-circuit also keys on place ID, so the name tag no
   longer guarantees a fresh run. The lab must not run it.
4. `/api/debug-sources` is read-only for corpus data but makes fresh Google,
   website, Menufy, ordering-platform, and Scrapfly calls. It is not the $0,
   zero-quota baseline path.
5. The same debug latency is attributed to each reported source, so it is not
   source-specific latency.
6. Menufy's debug hit flag only detects a direct Menufy page while the item
   count can include every website parser result. It can both miss a two-hop
   Menufy hit and misattribute schema.org items.
7. Freshness is source-blind in the old saturation path. A fresh Google/site
   run can cause the Mac crawler to skip stale DoorDash data.
8. `--zone temecula` merges the fixed 25 records with a global corpus backlog;
   the backlog query has no geographic filter and the zone argument is not
   validated.
9. Temecula currently has three incompatible approximations: a 25-record
   benchmark, a 9 km discovery radius, and a 15 km dashboard radius. None is a
   census boundary.
10. DoorDash store matching is hardcoded to California and the city string
    `temecula`, including code paths that can load replay targets from elsewhere.
11. Grubhub crawler comments still imply a working path, but the production
    source registry correctly pauses it after 270 zero-yield runs.
12. Source fixtures prove parser contracts, not live hit rate, identity
    precision, provenance precision, or incremental coverage.
13. `vercel.json` schedules `/api/cron/acquire`, while historical notes describe
    `/api/cron/saturate-temecula`. The scheduled route consumes
    `acquisition_jobs`; older viewport and Temecula discovery paths can create
    only `restaurants.status='queued'`, so the two queue models can diverge.
14. `/api/cron/acquire` leases a job with a source field but always runs the
    full Google/website/Gemini pipeline rather than a source-specific adapter.
15. Comments call Toast crawler-only, but `scripts/crawl.ts` contains no
    Toast-specific browser fetch. Toast currently has detection and shared site
    parsing, not a proven local connector.
16. Management menu and contribution routes have product workflows, but the
    reviewed route code does not establish a verified management claim before
    accepting Management-labeled publication.
17. `source_runs.ok=false` is used for zero items as well as failures, while
    source snapshots can record an empty fetch as succeeded. Historical
    absence and technical failure are not consistently separable.

## What DL-001 Can Measure With No Writes

From one forced-read-only metadata export:

- current Temecula entity/identity counts and duplicate candidates;
- menu/photo/source counts and observation timestamps;
- claimed coverage-ladder rungs;
- claimed comparison dishes and their source/author composition;
- source snapshots/states/runs, failures, latency, and queue health;
- current platform detection, brand memberships, and location overrides;
- how many claims lack evidence needed by the benchmark specification.

From committed local artifacts:

- the 25-record historical benchmark composition and its three result files;
- parser and sitemap contract behavior;
- historical source evidence and known failure modes.

DL-001 cannot verify image accessibility, exact dish identity, author
provenance, current menus, or true comparison pairs from metadata alone. Those
claims require a separate Guardian audit using bounded evidence.

## Historical Benchmark Inventory

The committed benchmark contains 25 hand-picked Temecula-area records, not a
census. On the three stored runs:

| Date | Restaurants | Avg photos | Avg reported menu matches | Restaurants with 7+ photos | Comparison metric |
|---|---:|---:|---:|---:|---|
| 2026-07-06 | 25 | 10.12 | 0.92 | 24 | Not recorded |
| 2026-07-07 | 25 | 6.16 | 0.96 | 15 | Not recorded |
| 2026-07-10 | 25 | 11.24 | 0.72 | 20 | Not recorded |

Only one restaurant reached seven reported menu matches in each stored run.
The files contain no Management/Customer counts, no comparison dishes, and no
audited precision. Historical values remain diagnostic inputs only.

## Gaps Prior Research Did Not Answer

- Which of the seven newer ordering-provider families has a current, repeatable
  item-plus-image access path on real restaurants?
- Which official merchant-authorized APIs can produce item-linked Management
  photos without scraping or new paid infrastructure?
- Which lawful, scalable sources can add Customer photos with defensible author
  and item evidence beyond Google heuristics and direct SeeFood uploads?
- What independent location/status source most economically closes the
  Temecula census gap after existing Google, OSM, and Overture identities are
  reconciled?
- What is the actual verified precision of current restaurant identity,
  item-match, and photo-author heuristics?

These gaps define the initial Gemini handoff and later bounded experiments.
