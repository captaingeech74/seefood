# SeeFood DataLab

## Purpose

SeeFood DataLab is a significant but isolated side project whose job is to find
and prove clever ways to strengthen SeeFood's restaurant, menu, and menu-photo
coverage. It is not a second product team and it does not ship autonomously.

The lab optimizes for the number of restaurants with at least one strongly
matched comparison dish containing both a Management photo and a Customer
photo. Raw records or raw photos acquired are not success.

Transformative, high-quality current-menu and Management-photo coverage is also
a valid strategic win even before Customer photos arrive, because it improves
the product users encounter and may create a contribution flywheel. That
flywheel is a hypothesis to measure, not an assumed fact.

The lab is national in ambition. It need not discover one magical source, but
large work advances only for a source or small complementary portfolio with a
credible path to materially transform US coverage. Its strategic value also
includes measuring the boundary between data that can be acquired
automatically and data SeeFood must generate through management and customer
participation.

The lab must not confuse current availability with strategic value. A source
can be technically excellent even when SeeFood cannot use it today because it
requires partner status, a commercial license, merchant authorization, a
custom exception, or a bespoke data agreement. The lab should discover and
rank those opportunities, identify the human path to permission, and preserve
them as negotiation candidates instead of discarding them.

Potential is not coverage. Permission-gated data never counts toward the
benchmark until SeeFood has authorized access and the result is independently
measured.

## Geographic Strategy

Use the rollout in `docs/METRO_ROLLOUT.md`:

1. Temecula as the complete optimization market.
2. San Diego metro.
3. San Diego County.
4. Los Angeles.
5. Remaining major California metros.
6. Top 50 US MSAs.
7. All 387 US MSAs.

Temecula is the complete development and validation market, not the scope of
the opportunity. Source selection and go/no-go decisions must be driven by
credible national leverage. A source that works only in Temecula does not
qualify as a game changer; a national source should improve Temecula as one
validation slice.

Maintain two evaluation sets:

- A Temecula census used to optimize immediate market coverage.
- A locked national holdout spanning chains, independents, city sizes, rural
  restaurants, trucks, ghost kitchens, cuisines, weak web presence, and recent
  openings/closures. Connector workers must not tune against this holdout.

## Coverage Ladder

Report every rung and never substitute raw volume for useful coverage:

1. Restaurants identified.
2. Restaurants with useful food photos.
3. Restaurants with a known current menu.
4. Restaurants with enough strong menu-matched photos above the fold.
5. Restaurants with at least 20% menu-photo coverage and seven photos.
6. Restaurants with at least 50% menu-photo coverage and seven photos.
7. Restaurants with one or more Management-versus-Customer comparison dishes.

Also report audited exact/strong item-match precision, incremental coverage by
source, duplicates, source failures, runtime, and cost per newly covered
restaurant, menu item, and comparison dish.

## Operating Model

The permanent DataLab Lead selects the largest weighted gap, maintains the
experiment queue, delegates one bounded experiment at a time, reviews evidence,
and approves lab-only changes.

Temporary roles:

- Source Discovery Scout: finds cited source hypotheses.
- Connector Worker: proves one source family with a minimal connector.
- Matching Scientist: improves identity, item matching, attribution, OCR,
  embeddings, or confidence calibration.
- Benchmark Guardian: owns the holdout and measures results independently.
- Adversarial Verifier: tries to disprove claims before a source is retained.

The implementation agent must not be the final evaluator of its own experiment.

## Opportunity And Access Model

Evaluate every source on three separate axes:

1. **Technical value:** its likely incremental strongly matched comparison
   coverage, identity quality, item linkage, provenance, freshness, scale, and
   uniqueness.
2. **Current access posture:** Open/Public, Merchant-authorized, Partner-only,
   Commercial license required, Custom permission required, Terms/rights
   unclear, Technically observable but currently unauthorized,
   Prohibited/unsafe, or Unknown.
3. **Recommended action:** Test now, Pursue permission, Pursue a commercial
   deal, Monitor, or Do not pursue.

An unsupported, private, or restricted surface may be documented as an
opportunity when public evidence suggests unusually high technical value. The
lab may describe what the surface appears to contain, who controls it, and what
permission would unlock a bounded validation. It may not defeat authentication,
evade access controls, misuse credentials, or collect data without permission.

For every high-value permission-gated opportunity, prepare a short deal brief:
the gatekeeper, the exact access or rights requested, a bounded pilot, the
value exchange, expected coverage, delivery and refresh needs, provenance and
usage rights, likely commercial terms, and a fallback. Human negotiation is a
valid next experiment path.

## Experiment Loop

Each cycle must:

1. Read `data-lab/STATUS.md`, `EXPERIMENT_QUEUE.md`, and `SOURCE_REGISTRY.md`.
2. Select one highest-value unresolved hypothesis.
3. State the expected coverage gain and evidence required before starting.
   Include the national scaling thesis; Temecula-only upside is insufficient
   for a large experiment.
4. Build the smallest useful probe in the isolated worktree.
5. Capture raw evidence and normalized output locally.
6. Test against the development cohort.
7. Have a separate evaluator test the locked holdout.
8. Measure incremental coverage, precision, failures, cost, and runtime.
9. Mark the evidence decision Keep, Revise, Reject, or Quarantine.
10. Separately record the access action: Test now, Pursue permission, Pursue a
    commercial deal, Monitor, or Do not pursue.
11. Update the lab files and identify the next best experiment.

Code running is not success. Verified coverage improvement is success.

## Promotion Gates

A source may be recommended to the main SeeFood build for implementation only
when it has:

- Incremental coverage beyond the existing stack.
- High restaurant-identity precision.
- Management, Customer, or Unknown provenance.
- Strong item matching with preserved evidence.
- Repeatable access across multiple runs.
- Known failure, duplicate, runtime, and cost characteristics.
- A plausible refresh path.

Weak matches remain quarantined and never count as published item coverage.
The main SeeFood thread reviews every recommendation and performs any actual
integration, migration, production test, and deployment.

A permission-gated source may be promoted earlier as an opportunity or
negotiation recommendation when its technical potential is evidenced, its
current access posture is explicit, and it has a concrete permission or deal
path. This is not an implementation recommendation and its projected coverage
must remain labeled as inferred until an authorized pilot is measured.

## Safety Boundary

The DataLab may inspect the current repository and read existing acquisition
history. It must not:

- Write to the production Supabase database.
- Write to the production R2 namespace.
- deploy to Vercel or alter aliases/domains.
- merge or push to `main`.
- change production infrastructure.
- start a paid service or materially consume a paid quota.
- run an unbounded crawl.
- access a private or restricted system without permission, defeat
  authentication, evade access controls, or use credentials outside their
  authorized purpose.

Raw samples and generated artifacts belong under ignored `data-lab/raw/`,
`data-lab/artifacts/`, or `data-lab/tmp/`. Small reproducible fixtures may be
committed only after secrets and personal data are removed.

Bounded external image reads are allowed during registered discovery,
validation, and evidence audits. The lab may download images from public or
already-authorized recorded locators when the experiment fixes the maximum
request and image count in advance, stores the bytes only in ignored lab
paths, records request/failure/cost behavior, and avoids material paid quota.
The lab may not defeat authentication, evade access controls, rotate identities
to bypass limits, or turn a bounded probe into a crawl. A downloaded image is
evidence to evaluate; it is not coverage until identity, usefulness, item
match, provenance, rights, and duplicate gates pass.

## Cadence And Reporting

Run one bounded experiment on Monday, Wednesday, and Friday nights. Produce one
plain-English weekly report after the Friday cycle.

Every weekly report begins with one verdict:

- **Bearing fruit**
- **Promising but unproven**
- **Stalled**
- **Needs a decision**

Then explain:

1. What was tested.
2. What actually improved.
3. How confident the lab is.
4. What it cost.
5. What happens next.
6. What Kyle needs to do, normally "Nothing."

Pause execution when three consecutive cycles produce no meaningful gain, money
or new credentials are required, production access would be needed, permission
is missing, or a business decision cannot be inferred. Do not erase the
opportunity: convert a technically strong blocked path into a decision or deal
brief for Kyle and the main SeeFood thread.

## Gemini Deep Research Bridge

Gemini Deep Research is a discovery scout, not an authority. The Lead prepares
an exact prompt in `data-lab/GEMINI_HANDOFF.md`. Kyle pastes it into Gemini and
returns the full result to the DataLab thread. The Lead turns claims into a
ranked experiment backlog or a permission/deal backlog. It verifies every
testable source with real data and clearly labels permission-gated potential
that cannot yet be measured.

Use Gemini initially and when the tested backlog is exhausted, not as a daily
dependency.

## Existing Context

Before proposing work, read:

- `DECISIONS.md`
- `docs/DATA_ACQUISITION_BACKLOG.md`
- `docs/METRO_ROLLOUT.md`
- `docs/INFRASTRUCTURE_OPTIONS_2026.md`
- `benchmark/restaurants.json`
- relevant code under `src/crawler/`, `src/lib/`, `scripts/`, and `crawler/`

Do not repeat experiments already documented in `DECISIONS.md` unless the
source has materially changed or the prior test was inconclusive.
