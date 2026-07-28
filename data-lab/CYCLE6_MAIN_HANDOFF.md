# Cycle 6 Main-Thread Handoff — DL-007 Final Readiness Repair

## Why This Is Cycle 6

This is the highest-value executable next cycle because it is the shortest path
to a real Customer-behavior result. DoorDash national yield and Tattle remain
high-potential, but the next meaningful steps require a separately authorized
live source probe or human/controller access. A synthetic connector would not
change the grand decision.

Cycle 6 is one final readiness repair, not another open-ended DL-007 loop.
Treatment stays disabled.

## Single Hypothesis

After correcting only the independently audited Stage 5 defects, the exporter,
runtime, and terminal database path can produce identical contribution
eligibility/comparison decisions and a falsifiable state machine suitable for
a separately authorized capped behavioral pilot.

## Exact Scope

Use Stage 5 commit `16608802c1a6b40ed1515f81c4356fdbea24785e` as the audited
starting point.

Correct these defects only:

1. Runtime must consume the database key `behavioral`, not `behavior`.
2. Put contract interpretation in one pure runtime adapter used by the live
   route and the parity evaluator. Test the adapter against direct database
   contract output for every exported roster row. Do not compare one SQL column
   with an alias of itself.
3. On every non-OK upload response and local preparation failure, retire the
   cached attempt ID. A retry must create a new attempt. Preserve idempotent
   replay only for a successfully recorded photo.
4. Replace summary-only adversarial claims with captured test names and
   assertions covering:
   - concurrent terminal approval/rejection of one attempt;
   - replay after both approval and rejection;
   - every binding field independently changed: restaurant, menu item, visitor,
     session, experiment, variant, surface, and target class;
   - contradictory receipt races;
   - retry after client failure and each server non-OK terminal failure using a
     new attempt ID;
   - every named behavioral and gold gate, including
     `distinctFromCustomer` and `lacksVerifiedCustomerSameDish`; and
   - absence of both `comparison_ready` and
     `verified_comparison_created` whenever any gold gate fails.
Do not add product features, source acquisition, new rights approvals, new
Management-photo requirements, or descriptive cohort quotas.

## Required Tests

Run in a disposable/local or explicitly isolated test environment:

- complete unit suite and TypeScript;
- production build with inert/test configuration;
- isolated PostgreSQL adversarial matrix;
- route-level contribution-attempt and upload retry tests; and
- a parity test that passes direct database JSON through the exact live runtime
  adapter for every bounded exported row.

The implementation worker must not be the final evaluator of these results.

## Required Sanitized Read-Only Bundle

Place the completed handoff under:

`data-lab/raw/baseline/DL-007/main-thread-cycle6`

Include:

- `SHA256SUMS`;
- exact exporter commit and rollback/read-only snapshot proof;
- direct database contracts and runtime-adapter outputs for every roster row,
  with mismatch count;
- behavioral/gold aggregate counts;
- attempts and immutable receipts with all binding/eligibility fields,
  sanitized (they may remain empty);
- assertion-level isolated database and route-test results;
- exact queries, schema, redaction report, and aggregate geography.

Do not include secrets, PII, raw national identities, source URLs, or hidden
holdout identities.

## Hard Exit Gate

Cycle 6 passes only if:

- database versus live runtime adapter mismatches equal **0** across every
  exported row;
- every required adversarial assertion passes;
- retry tests prove a new attempt ID after every terminal/local failure;
- treatment and conversion/coverage claims remain disabled; and
- DataLab independently reproduces the result.

Any failure closes DL-007 as not pilot-ready. Do not request another repair
cycle.

Passing Cycle 6 does not authorize Cycle 7, treatment enablement, production
data claims, or a live pilot. Return the evidence and brief main-lead report,
then wait for DataLab and Kyle.

## Main-Lead Brief

Begin with exactly one verdict:

- Bearing fruit
- Promising but unproven
- Stalled
- Needs a decision

Then state, briefly: what changed, exact passing/failing evidence, production
impact, cost, remaining risk, and whether Cycle 6 passed its hard exit gate.
