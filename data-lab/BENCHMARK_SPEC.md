# DataLab Benchmark Specification

## Status

Version 0.1, established by experiment DL-000 on 2026-07-23. The cohort
selection rules are fixed. DL-001 calibrates the metric on a small sample; the
actual Temecula and national manifests will be frozen in DL-002 before any
connector is tuned.

## Decision This Benchmark Supports

Did a bounded experiment create more restaurants with at least one strongly
matched dish containing both a Management photo and a Customer photo, without
reducing identity precision, item-match precision, provenance quality, or
repeatability?

Raw identities, menu rows, image URLs, AI labels, or downloaded images do not
answer this question.

## Unit Of Measurement

The primary unit is one real, customer-facing restaurant location. A virtual
brand at the same address is a separate unit only when a customer can order
from a distinct current menu under that brand. Duplicate provider listings,
catering sub-listings, and aliases are not separate restaurants.

Closed locations remain in a status challenge set, but never improve active
restaurant coverage.

## Required Evidence Definitions

### Identified Restaurant

A unique location with name, operating status, and a usable location. Provider
identity links must survive independent name, address, and distance review.

### Known Current Menu

A menu observed no more than 30 days before the cohort freeze with its source
and observation time preserved. A verified Management publication may be up to
90 days old when no later declared menu change exists. Common Crawl or another
archive never establishes current status without a qualifying live or verified
Management observation. An inherited chain menu counts only after the location
membership is confirmed, the template was observed within 30 days, and known
location exceptions are applied. An AI-generated dish label is not a menu.

### Useful Food Photo

An accessible, non-duplicate image of an orderable item. Storefronts, interiors,
menu boards, promotional graphics, and inaccessible URLs do not count.

### Strong Item Match

A photo is strongly matched only when preserved evidence connects it to the
same restaurant and a current canonical menu item. Accepted evidence is:

1. A management-controlled catalog or menu record that pairs the item and image.
2. A first-party Management or Customer submission explicitly attached to a
   current item.
3. An independently audited match whose evidence supports the exact or clearly
   equivalent menu item with high confidence.

The following do not count without audit: an AI label alone, substring
containment alone, a shared generic dish word, or a canonical dish ID created
from the same unaudited label.

The Guardian grades audited matches as:

- `exact`: the source item identity and photo attachment are the same record;
- `strong`: small naming differences exist, but the preserved menu and visual
  evidence unambiguously identify the same item;
- `weak`: only a generic family or ingredient overlaps; or
- `reject`: wrong restaurant, wrong item, unsupported, or unusable.

Only `exact` and `strong` count.

### Management Photo

The restaurant, verified management, or a management-controlled ordering/menu
catalog supplied the photo. The origin and author inference must be retained.
Unknown origin never counts as Management.

### Customer Photo

A diner or non-management contributor supplied the photo. A direct SeeFood
upload counts after its restaurant and dish attachment pass review. A Google
contributor heuristic counts only after its provenance is audited. Unknown
origin never counts as Customer.

### Comparison Dish

One active canonical dish at one active restaurant with:

- at least one strong Management photo match;
- at least one strong Customer photo match;
- two distinct, accessible, non-duplicate images; and
- preserved restaurant, item-match, author, and source evidence.

## Coverage Ladder

Every report gives both a count and a percentage of the active cohort.

| Rung | Restaurant qualifies when |
|---|---|
| 1. Identified | The restaurant identity passes the definition above. |
| 2. Useful food photos | At least one useful food photo exists. |
| 3. Known current menu | At least one current menu item exists. |
| 4. Above-fold matched | At least seven strong menu-matched photos exist. |
| 5. 20% and seven | At least seven strong matched photos cover at least 20% of distinct current menu items. |
| 6. 50% and seven | At least seven strong matched photos cover at least 50% of distinct current menu items. |
| 7. Comparison ready | At least one comparison dish exists. |

Also report distinct matched dishes. Seven photos of one dish satisfy neither
the 20% nor the 50% distinct-menu coverage requirement unless the menu
denominator itself makes that mathematically true.

## Required Result Fields

For the full cohort and each source family, record:

- active restaurants and identity precision;
- every coverage-ladder rung;
- strongly matched photos and distinct matched dishes;
- Management, Customer, and Unknown photo counts;
- comparison dishes and comparison-ready restaurants;
- audited item-match precision with a 95% Wilson interval;
- audited provenance precision with a 95% Wilson interval;
- exact and near duplicates;
- inaccessible images and source failures;
- incremental coverage beyond the frozen existing stack;
- runtime, money, quota consumption, and operator time;
- refresh method and result on a repeat run.

Historical or metadata-derived counts are labeled `claimed`. They become
`verified` only after the Benchmark Guardian audits the supporting evidence.

## Incremental-Coverage Rule

For a source or method `X`, compare the same frozen records with and without
`X`. Incremental coverage is the number of restaurants that cross a rung only
when `X` is included. A source does not receive credit for duplicate rows,
already-covered dishes, or a Management photo on a dish that still has no
Customer photo.

## Temecula Census

### Boundary

Use the versioned US Census TIGER/Line incorporated-place polygon for Temecula,
California (state FIPS 06, place FIPS 78120). Record the TIGER/Line vintage,
download URL, file hash, and snapshot date in the manifest. The existing 9 km
discovery radius and 15 km dashboard radius are useful product controls, but
neither defines the census.

### Inclusion

Include active customer-facing restaurants, cafes, bakeries, bars with a food
menu, winery/brewery kitchens, food-hall stalls, stable public food-truck
locations, and distinct local ghost/virtual brands whose service point lies
inside the polygon.

Exclude grocery/convenience retail without a prepared-food restaurant, private
clubs without public ordering, catering-only businesses without public service,
duplicates, test fixtures, and locations confirmed closed before the freeze.
Keep closures in a separate status ledger so the identity system is still
tested.

### Candidate Union

The census is the deduplicated union of versioned, bounded snapshots from:

- existing SeeFood entities and Google identities;
- OpenStreetMap identities;
- Overture identities; and
- one independently maintained local permit, inspection, license, or equivalent
  location/status frame selected from cited evidence before DL-002 starts.

No single provider is treated as ground truth. DL-002 cannot lock the census
until the independent local frame has been versioned, bounded, and reconciled.
If no $0 frame currently authorized for this benchmark is available, DL-002
must stop with a corpus-derived candidate baseline and must not call it a
census. A superior permission-gated frame should still be recorded as an
opportunity, but it cannot enter the benchmark before permission.

DL-DR-001 identified Riverside County DEH inspection records as the preferred
local-frame candidate, but did not find a documented stable bulk export of all
active Temecula food facilities. Searchable inspection reports and 60-day
closure lists do not by themselves satisfy the candidate-frame requirement.

### Manifest

The committed sanitized manifest will contain the stable DataLab ID, public
name, coarse business type, coordinates, inclusion/status decision, provider
IDs, chain/independent flag, web-strength stratum, and evidence timestamps. It
will contain no credentials, private contacts, or personal data.

Every selectable record must have a stable public- or provider-derived rank ID.
An internal database entity UUID may be retained as a join key but may never be
the deterministic selection rank input. An identity-only row with no qualifying
stable external ID remains in identity-quality accounting but is ineligible for
cohort selection until that ID is established.

Temecula is visible to connector workers and may be optimized.

Before lock, independently second-review 100% of ambiguous, truck, ghost,
closure, and duplicate decisions plus a deterministic 10% sample of ordinary
rows.

## Locked National Holdout

### Size And Orthogonal Margins

Freeze 120 unique records: 108 open/orderable locations in the content
denominator and 12 recent closure/move/replacement sentinels scored for status
accuracy.

| Axis | Required distribution |
|---|---|
| Market size | 36 top-20 MSA, 30 other top-50 MSA, 24 MSA ranks 51-387, 18 micropolitan, 12 noncore rural |
| Business form | 30 national/large regional chain, 48 single-location independent, 12 small multi-location, 12 food trucks, 12 ghost kitchens, 6 nontraditional venues |
| Web strength | 30 structured first-party, 30 ordering-platform-only, 30 weak/PDF/social-only, 30 with no discoverable website |
| Lifecycle | 96 stable open, 12 opened within 12 months, 12 recently closed/moved/replaced |
| Cuisine | 10 each: American/comfort; Mexican/Latin American; Italian/European; Chinese/Taiwanese; Japanese/Korean; Southeast Asian; South Asian; Middle Eastern/Mediterranean; African/Caribbean; barbecue/soul/Cajun; cafe/bakery/dessert; vegetarian/health/specialty |
| Census geography | New England 10, Middle Atlantic 14, East North Central 14, West North Central 10, South Atlantic 18, East South Central 8, West South Central 14, Mountain 14, Pacific 18 |

Business form and cuisine use one primary assignment per location so totals
cannot be inflated through overlapping labels. Limit any brand to two
geographically separated locations. The selection log records ambiguous cases.

### Candidate Frame And Deterministic Selection

The Guardian freezes a deduplicated national candidate frame from existing
SeeFood identities plus one versioned national identity snapshot currently
authorized for this use and available without new paid access. Every candidate
receives the six holdout stratum fields and a stable public-data-derived ID.
The frame, source versions, field rules, exclusions, and hash remain
Guardian-owned. Better restricted frames remain valid deal opportunities but
do not enter the locked holdout until access is authorized.

Selection is a deterministic constrained optimization:

1. Remove Temecula, legacy benchmark, development, test-fixture, duplicate, and
   ineligible records.
2. Compute `rank = SHA-256(secret_seed || stable_id)` and sort ascending.
3. Choose exactly 120 binary records satisfying every published quota and the
   two-location brand cap while minimizing the sum of ranks. Ties break on
   stable ID.
4. Independently review eligibility, then rerun the same optimization with
   factually ineligible IDs excluded. Do not hand-substitute favorable rows.
5. Reserve the next 24 feasible records under the same objective as alternates.

Commit the algorithm, candidate-frame hash, solver/version, quota totals, and a
SHA-256 commitment to the secret seed. Keep the seed and clear IDs with the
Guardian. If the constraints are infeasible, stop and version the specification
before any source experiment; never silently relax a quota.

### Lock And Anti-Leak Rules

The Benchmark Guardian owns the full manifest at
`data-lab/raw/holdout/national-v1.json`; it is ignored and never given to a
Connector Worker or Matching Scientist. Commit only the selection recipe,
stratum totals, and SHA-256 hash.

The constrained selection and eligibility review above are authoritative. A
bad experiment result is never a reason to replace a location. Replace only a
proven duplicate or a record whose freeze-date eligibility was factually
wrong, using the next preselected alternate and a versioned change log.

Temecula records and the 25 legacy benchmark records are ineligible for the
national holdout.

Workers submit frozen code and configuration before one holdout evaluation.
The Guardian returns aggregate metrics and preregistered slice summaries, not
per-record failures, until the experiment decision is final. If identities or
gold labels leak, retire those rows to development and replace them under the
same quotas with a new version and hash.

## Evaluation Ownership

The worker receives the Temecula development manifest and any source-specific
fixtures, but not the national IDs. The Benchmark Guardian runs the unchanged
method on the locked holdout and calculates results. An Adversarial Verifier
reviews claimed gains, false matches, provenance, duplicates, and source
failures before the Lead records Keep, Revise, Reject, or Quarantine.

The implementation worker is never the final evaluator.

## Full Baseline Snapshot Contract

DL-002 will:

1. Export only the required metadata in a database transaction forced to
   `READ ONLY`, or consume a sanitized export supplied by the main SeeFood
   thread.
2. Save raw exports under ignored `data-lab/raw/`.
3. Compute all metrics locally into ignored artifacts.
4. Commit only aggregate results, the sanitized Temecula manifest, query text,
   schema version, timestamps, and hashes.
5. Use only a sanitized evidence bundle supplied locally under
   `data-lab/raw/baseline/DL-002/`. It must contain the bounded image render or
   bytes, current-menu snapshot, source page/record evidence, provenance
   evidence, and hashes needed for each audited claim, with contributor IDs and
   other personal data removed.
6. Make no app-route calls, external source calls, image downloads, or writes.

If the local evidence bundle lacks an image, menu observation, or author
evidence, mark that claim `unverifiable`; do not fetch the missing evidence.
`Claimed` and `verified` counts remain separate even when this leaves the
verified baseline incomplete.

The legacy `scripts/benchmark.mjs` is prohibited in the lab against production:
it calls `/api/dishes`, and a cache miss persists results to Supabase.

## Baseline Acceptance

The baseline is complete only when:

- every cohort record has an inclusion/status decision;
- all seven rungs are computed from one frozen snapshot;
- claimed and verified comparison counts are separated;
- a Guardian-owned audit covers every claimed comparison dish when the count is
  at most 100, otherwise a reproducible stratified sample of 100;
- item-match and author/provenance disagreements are recorded;
- queries, hashes, runtime, and $0 cost are reproducible; and
- the locked national manifest hash exists before any connector experiment.

No source is promoted from a single positive run. A retained source needs
repeatable incremental coverage, high identity and item-match precision,
preserved provenance, known failure/cost behavior, and a plausible refresh
path.

## Strategic National Go/No-Go Screen

The source-level promotion gates below can justify another bounded experiment
or a useful connector recommendation. They do not by themselves justify the
full DataLab program.

For the larger program to proceed, at least one source or complementary
portfolio of no more than three access paths must have a credible, evidenced
route to one of these national outcomes:

- at least a 20 percentage-point absolute increase in US restaurants with a
  current menu and at least one strong Management photo; or
- at least a twofold increase in strong Management-versus-Customer
  comparison-ready restaurant coverage.

Before the audited baseline exists, report low/base/high outcomes per 1,000
eligible US restaurants and state the baseline required to pass the screen.
After authorized measurement, gains must appear across multiple Census
divisions, market-size strata, chains, and independents. A Temecula-only gain
cannot pass; Temecula is the optimization and validation slice.

## Promotion Gates

A recommendation to the main SeeFood thread requires:

- audit of every newly credited comparison pair;
- zero wrong-restaurant and zero same-image comparison pairs;
- an identity audit of at least 125 distinct links pooled across frozen
  Temecula and national evaluation records, reported separately by cohort, with
  zero wrong links, point precision of at least 99%, and a 95% Wilson lower
  confidence bound of at least 97%;
- strong item-match precision of at least 95%, with a lower bound of at least
  90%, calculated on every new comparison match plus a deterministic sample of
  other candidate matches, with at least 35 audited matches;
- Management and Customer provenance precision each of at least 95%, with a
  lower bound of at least 90%, with at least 35 independently audited photos in
  each author class across the frozen evaluation cohorts;
- at least three newly comparison-ready Temecula restaurants or a 10% relative
  improvement, whichever is smaller but never fewer than two;
- at least two newly comparison-ready national holdout restaurants across two
  market-size strata, with no net regression;
- preservation of existing accepted pairs, with every regression explained;
- at least 95% retention of accepted records across two bounded repeat runs;
- frozen evidence, manifest/code/model/prompt hashes, and offline
  reproducibility; and
- fully reported request count, runtime, money, quota use, failures, and refresh
  path within the preregistered cap.

One new audited pair with no false pair may justify another bounded experiment.
It is not enough for promotion. If a method produces too few auditable records
to meet a minimum denominator, report it as promising or unproven rather than
pooling in unrelated historical claims.
