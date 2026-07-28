# DL-007 — First-Party Contribution Funnel, Cycle 6

## Final Decision

**Reject as not pilot-ready and close DL-007. Keep treatment disabled.**

Cycle 6 does not pass its exact predeclared hard exit gate. The runtime-key
repair and database/runtime parity are real, but the supplied tests do not
exercise the required route-level retry flow or prove a newly generated
attempt ID after each local and server failure. The database gate loop also
does not prove both required terminal absences for every failed gold gate.

The finish line requires closure after this failure. No further DL-007 repair
cycle, live Customer treatment, conversion claim, or coverage claim is
authorized.

## Bound And Integrity

DataLab inspected only:

- sanitized bundle
  `data-lab/raw/baseline/DL-007/main-thread-cycle6`;
- exact Git object `42cccfff640570f2b22c68b84dbc36754916ed19`; and
- a disposable detached checkout plus a disposable PostgreSQL 16 database.

The supplied `SHA256SUMS` file hashes to
`b13882a2bec706e11cb91104ff2366059bda754556c7d000023db4fd617fb524`.
Every listed file passed. The manifest records one repeatable-read/read-only
snapshot ending in `ROLLBACK`; treatment and conversion/coverage claims are
disabled. Independent scans found no raw identities, source URLs, obvious
credentials, email addresses, or hidden-holdout identities in the roster.

## Independently Reproduced Result

| Measure | Result |
|---|---:|
| Canonical roster rows | 5,204 |
| Restaurants/entities | 71 / 71 |
| Database/runtime behavioral candidates | 4,186 across 59 restaurants |
| Gold candidates | 0 |
| Database/live-adapter mismatches | 0 / 5,204 |
| Selector reconciliation rows | 0 |
| Real attempts / receipts | 0 / 0 |
| Unit/application tests | 90 / 90 passed |
| Isolated database assertion labels | 33 / 33 passed |
| Verified coverage improvement | 0 |
| Money cost | $0 |

The main summary's `4,004 across 57 restaurants` is stale. The Cycle 6 roster
itself contains `4,186 across 59`; the bundle's
`cross-snapshot-drift.json` also records 4,186 behavioral candidates. This
count correction does not change coverage because behavioral eligibility is
not a comparison dish and all 5,204 rows fail gold.

## What Passed

- A fresh locked-dependency checkout passed all 90 tests and TypeScript.
- A production build passed with inert placeholder configuration.
- The isolated database runner passed in a new disposable PostgreSQL database.
- Passing all 5,204 sanitized direct database contracts through the exact
  `interpretContributionGoldContract` implementation reproduced 4,186
  behavioral candidates, zero gold candidates, and zero stored-output
  mismatches.
- The runtime now reads `behavioral`, fails the obsolete `behavior` key closed,
  and shares the adapter used by the exporter.
- The isolated database runner reproduced one-shot approval/rejection,
  concurrent terminal review, contradictory-receipt handling, the named
  contract gates, and the one tested failed-gold terminal case.
- Hash, rollback, aggregate-geography, empty attempt/receipt, and redaction
  evidence is internally consistent.

## Decisive Missing Evidence

### No route-level retry proof

The handoff required route-level contribution-attempt and upload retry tests
and a new attempt ID after every local or server non-OK failure. No test imports
or invokes either API route. The retry unit tests call only
`shouldRetireContributionAttempt` with booleans; they do not exercise the
client's cached-attempt map, either route, response parsing, or
`crypto.randomUUID()`, and never compare old and retry IDs.

The isolated database test labeled `terminal failure retry uses a new attempt
ID` inserts two preselected UUID rows and verifies that the literals differ.
It is not connected to a client failure or any `400`, `409`, `413`, `422`,
`500`, `502`, or `503` route outcome. Therefore the required retry behavior
was not independently falsified at the route/application boundary.

### Per-gate terminal absence matrix is incomplete

The handoff required absence of both `comparison_ready` and
`verified_comparison_created` whenever any gold gate fails. The runner mutates
each named gate and checks only that `contribution_gold_contract(...).eligible`
is false. It performs terminal review and checks both absences for one
Management-provenance failure, not for every behavioral and gold gate.

The named-gate contract checks are useful, but they are not the predeclared
terminal state-machine matrix.

## Independent Verification

The evaluator did not use a production database or live adapter. It:

1. verified every bundle hash and recomputed all roster aggregates;
2. loaded the exact runtime adapter from the supplied Git object and replayed
   all 5,204 sanitized database contracts;
3. installed the locked dependencies in a detached disposable checkout and
   reran tests, TypeScript, and the inert production build;
4. ran the supplied database runner against a fresh disposable PostgreSQL 16
   database; and
5. inspected the runtime, client upload path, API routes, migrations, exporter,
   test source, and captured JSON rather than trusting summary labels.

The implementation is materially better than Stage 5, but the exact gate was
evidence-complete by design. Passing implementation fragments do not waive its
missing adversarial cases.

## Coverage, Cost, And Access

- Verified comparison baseline: zero.
- New comparison-ready restaurants or dishes: zero.
- Real attempts, receipts, or valid Customer uploads: zero.
- Treatment: disabled.
- Money: $0.
- Production writes, deployment, push, merge, source crawl, or hidden-holdout
  access by DataLab: none.
- Evidence decision: **Reject as not pilot-ready; close DL-007.**
- Access action: **Do not pursue another DL-007 repair cycle.**

## Next Action

Select Cycle 7 as DL-014's authorized stored-replay and existing-evidence
preflight, the highest-ranked remaining path that can be examined without
vendor contact, credentials, live store retrieval, bot-control circumvention,
paid quota, or production access. This selection does not authorize a live
DoorDash probe and Cycle 7 has not started.

No Cycle 7 main-thread handoff is created because the Cycle 6 instruction
allowed that handoff only on a pass.
