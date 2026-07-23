# Source Registry

This is a decision index, not a substitute for `DECISIONS.md` or
`ACQUISITION_MAP.md`. Results below are historical/code-state evidence until
DL-001 produces a DataLab baseline.

| Source family | Existing SeeFood state | Historical evidence | DataLab status | Next evidence required |
|---|---|---|---|---|
| Google Places identity | Primary identity and discovery source | Production path exists; no committed identity precision audit | Re-measure | Incremental identities, duplicate/merge precision, quota per accepted location |
| OpenStreetMap identity | Nominatim/Overpass discovery and identity linking | <=175 m plus name-overlap matcher exists | Re-measure | Independent match precision and incremental census identities |
| Overture identity/websites | California GeoJSONL importer and website job seeding | Import path exists; no committed precision result | Re-measure | Incremental identities/sites and merge precision |
| Google photos/reviews | Primary live Customer/owner-candidate photos plus review signals | Hard provider photo cap and several pipeline fixes documented | Quarantine north-star claims | Accessible useful-photo yield, author precision, strong item-match precision |
| Gemini naming/OCR | Batched photo analysis, quality, duplicate detection, menu OCR | Live regressions/fixes documented | Quarantine as benchmark truth | Blind item-match, duplicate, and provenance audit |
| Restaurant websites/schema.org | Up to 10 linked pages, menu/schema/assets | Bluewater historically improved 6 to 13 photos | Re-measure | Incremental strong Management matches, freshness, failure rate |
| Common Crawl | Archive lookup/backfill path exists | No committed incremental result | Candidate | Freshness and incremental menu/Management-photo coverage on a bounded sample |
| Menufy/HungerRush | Direct API, link follower, rendered fallback | Richie's historically returned 221 items | Re-measure, do not reinvent | Current hit rate, image yield, provenance, repeatability |
| DoorDash | Public state sitemap plus Camoufox and RSC parsers | Small CA discovery check was 4/5; multiple drift bugs fixed | Re-measure carefully | Current URL identity precision, page/item/photo yield, repeat run, incremental comparisons |
| Grubhub | Camoufox path exists but registry is paused | 270 runs produced zero items/photos | Reject until material change | Cited source change before any new bounded test |
| Toast | Link detection; crawler-only for expensive page access | Real links found; direct access historically blocked/expensive | Candidate | $0 stored replay or official access evidence before live test |
| Square/ChowNow/Clover/Olo/Popmenu | Detection, generic extraction, rendered fallback | Render worked; tested extraction remained unproven | Candidate family | One provider at a time on 12 visible restaurants |
| BentoBox/Owner/SpotHopper/Slice/Flipdish/Lightspeed/GloriaFood | Detection and generic extraction registered | No source-specific live result documented | Highest discovery gap | Current official/public access pattern and bounded live fixtures |
| Brand templates | Exact-name automatic memberships and inherited menus | Implemented; membership is not confirmed by default | Quarantine location claims | Membership precision and location-availability audit |
| Management menu capture | OCR page capture, review, publish workflow | Product path exists | Strategic fallback | Conversion, confirmation accuracy, and comparison dishes created |
| Merchant APIs | Google Business, Square, Toast, Clover scaffolding | Availability/normalizer only; no live import route | Candidate with authorization | Official scopes, partner access, costs, item-image linkage |
| Merchant social import | Consent-first design in backlog | Not implemented | Research gap | Official provider access, rights/provenance, expected item-match workflow |
| Customer contributions | Upload and missing-dish workflows exist | No verified conversion/coverage baseline | Strategic moat | Read-only aggregate conversion and comparison coverage |

Every retained source must eventually record access method, sample size,
incremental coverage, provenance, item-match quality, repeatability, cost,
failure rate, refresh path, and Keep/Revise/Reject/Quarantine decision.
