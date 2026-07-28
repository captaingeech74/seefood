# DL-007 — First-Party Contribution Funnel, Stage 5

## Final Decision

**Revise and close the five-cycle run. Keep treatment disabled.**

Push 5 did not pass its exit gate. The database-owned contract is materially
better, but the live runtime reads the wrong JSON field and therefore disagrees
with the database on every eligible prompt target. No live pilot, conversion
claim, or coverage claim is authorized.

No Push 6 is requested.

## Bound And Integrity

DataLab inspected only:

- the sanitized read-only bundle at
  `data-lab/raw/baseline/DL-007/main-thread-stage5`;
- Git objects through exact exporter commit
  `16608802c1a6b40ed1515f81c4356fdbea24785e`; and
- a disposable archive of that commit.

The supplied `SHA256SUMS` file hashes to
`251aa26687a9d18a187e5d602626ab1a396db82e291869c156f694bee0f55fe1`.
Every listed file passed. The manifest records repeatable-read/read-only state
before and after one snapshot and terminal `ROLLBACK`. Treatment and
conversion/coverage claims are disabled.

Reproduce the audit with:

```sh
node data-lab/scripts/evaluate-dl007-stage5.mjs \
  data-lab/raw/baseline/DL-007/main-thread-stage5
```

The evaluator intentionally exits nonzero because the Push 5 exit gate fails.

## Reproduced Bundle Result

| Measure | Result |
|---|---:|
| Canonical roster rows | 5,204 |
| Restaurants/entities | 71 |
| Database behavioral candidates | 4,004 across 57 restaurants |
| Gold candidates | 0 |
| Serialized contract mismatches | 0 |
| Named-gate Boolean mismatches | 0 |
| Selector reconciliation rows | 0 |
| Real attempts / receipts | 0 / 0 |

The bundle is internally consistent. All 5,204 serialized contracts equal the
duplicated database value, and each eligibility Boolean equals the AND of its
named gates. That consistency does not establish runtime parity.

## What Improved

- Behavioral and Management-photo gates now live in database functions.
- The Management selector evaluates every attached photo and places passing
  photos before failing photos.
- Menu/photo snapshots are bound to the entity and source.
- Gold requires independent provenance, usefulness, display-rights, and
  near-duplicate reviews.
- Existing records default to not reviewed; none were bulk-approved.
- Public traffic that survives server exclusions is called
  `eligible_external`, not verified human traffic.

These are real implementation improvements. They created no new verified data:
all 5,204 rows still fail multiple Management review/rights gates, and gold
coverage remains zero.

## Decisive Failure

The database returns:

```text
contract.behavioral
```

The live runtime reads:

```text
contract.behavior
```

It then substitutes an empty object and sets behavioral eligibility to false.
The database/exporter report 4,004 eligible targets; the runtime treats all of
them as ineligible. This directly violates the zero-disagreement exit gate.

The bundle did not catch the defect because `direct_contract` is only an alias
of the same already-computed SQL value. It proves serialization consistency,
not a second database invocation or runtime interpretation.

## Other Failed Evidence Requirements

- A non-OK upload response alerts the user but does not clear the cached
  terminal attempt ID. The next retry can reuse the closed attempt.
- The retry fixture merely inserts two different UUID rows; it does not
  exercise the actual retry flow.
- There is no concurrent terminal-review test.
- The binding replay unit test changes only restaurant and menu item.
- Failed-gold tests do not verify absence of the
  `verified_comparison_created` event.
- The named gate loop omits direct tests for `distinctFromCustomer` and
  `lacksVerifiedCustomerSameDish`.
- The adversarial bundle contains summary labels rather than captured,
  assertion-level test results.
- The empty selector ledger provides no explicit old/new population totals or
  delta.
- The 3,912-to-3,881 drift file supplies a plausible timing narrative but no
  aggregate gate-state evidence proving it.

## Independent Evaluation

The Benchmark Guardian independently passed bundle integrity and recomputed
the 4,004/0 roster, but rejected the reconciliation and adversarial evidence.
The Adversarial Verifier independently found the runtime field mismatch,
circular parity proof, broken non-OK retry path, and incomplete test matrix.

A disposable checkout passed 80 tests, TypeScript, and a production build with
inert placeholder environment values. Passing tests do not override the
untested runtime disagreement.

## Cost And Outcome

- Money: $0.
- DataLab production writes/deployments/main changes: none.
- Real contributions or comparisons created: none.
- Verified coverage improvement: zero.
- Treatment or pilot authorization: no.
- Further DL-007 push requested: no.
