# SeeFood DataLab

## Purpose

SeeFood DataLab is a significant but isolated side project whose job is to find
and prove clever ways to strengthen SeeFood's restaurant, menu, and menu-photo
coverage. It is not a second product team and it does not ship autonomously.

The lab optimizes for the number of restaurants with at least one strongly
matched comparison dish containing both a Management photo and a Customer
photo. Raw records or raw photos acquired are not success.

The lab is expected to produce meaningful improvements, but it is not expected
to discover one magical source that provides perfect nationwide coverage. Its
strategic value also includes measuring the boundary between data that can be
acquired automatically and data SeeFood must generate through management and
customer participation.

## Geographic Strategy

Use the rollout in `docs/METRO_ROLLOUT.md`:

1. Temecula as the complete optimization market.
2. San Diego metro.
3. San Diego County.
4. Los Angeles.
5. Remaining major California metros.
6. Top 50 US MSAs.
7. All 387 US MSAs.

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

## Experiment Loop

Each cycle must:

1. Read `data-lab/STATUS.md`, `EXPERIMENT_QUEUE.md`, and `SOURCE_REGISTRY.md`.
2. Select one highest-value unresolved hypothesis.
3. State the expected coverage gain and evidence required before starting.
4. Build the smallest useful probe in the isolated worktree.
5. Capture raw evidence and normalized output locally.
6. Test against the development cohort.
7. Have a separate evaluator test the locked holdout.
8. Measure incremental coverage, precision, failures, cost, and runtime.
9. Mark the experiment Keep, Revise, Reject, or Quarantine.
10. Update the lab files and identify the next best experiment.

Code running is not success. Verified coverage improvement is success.

## Promotion Gates

A source may be recommended to the main SeeFood build only when it has:

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

Raw samples and generated artifacts belong under ignored `data-lab/raw/`,
`data-lab/artifacts/`, or `data-lab/tmp/`. Small reproducible fixtures may be
committed only after secrets and personal data are removed.

When a lab experiment needs production evidence, the main SeeFood thread—not
the lab—must create a bounded, sanitized, forced-read-only export. Production
credentials never move into the DataLab worktree. The lab receives local
evidence files under its ignored `data-lab/raw/` path and performs no live
fetches. Each export must preserve provenance, include exact queries and hashes,
remove customer personal data and secrets, and keep the implementer separate
from the final evaluator. The current procedure is documented in
`docs/DATALAB_READ_ONLY_EXPORT.md`.

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

Pause when three consecutive cycles produce no meaningful gain, money or new
credentials are required, production access would be needed, or a business
decision cannot be inferred.

## Gemini Deep Research Bridge

Gemini Deep Research is a discovery scout, not an authority. The Lead prepares
an exact prompt in `data-lab/GEMINI_HANDOFF.md`. Kyle pastes it into Gemini and
returns the full result to the DataLab thread. The Lead turns claims into a
ranked experiment backlog and verifies every promising source with real data.

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
