# DL-007 Push 5 Handoff — One Measurement Contract

## Verdict

Stage 4 is **Revise**. The final push in this five-cycle run must make the
pre-launch measurement contract internally identical and falsifiable. Keep the
treatment disabled. Do not add product scope.

## Single Objective

Make one server-owned contract determine:

1. behavioral prompt eligibility;
2. the selected Management counterpart;
3. gold-comparison eligibility; and
4. terminal comparison creation.

The exporter, runtime route, and terminal database function must consume that
same contract rather than reimplementing it.

## Required Corrections

- Put the canonical behavioral and gold gate evidence in database functions
  that return both the selected photo ID and named gate outcomes. The exporter
  must serialize those results directly. Runtime must call the same behavioral
  function. Delete or stop using the parallel JavaScript gate calculations.
- Evaluate every attached Management photo before selecting the highest-quality
  photo that passes all applicable gates. Bind successful menu/photo snapshots
  to the same entity and source. Require current active records, independent
  provenance review, independent display-rights review, usefulness review,
  exact/explicit item link, exact-hash uniqueness, measured perceptual hash,
  independent near-duplicate clearance, and no duplicate parent/reason.
- Add an auditable Management display-rights review state. Do not infer approval
  from legacy metadata and do not bulk-approve existing records.
- Make failed upload attempts terminal. A legitimate retry must receive a new
  attempt ID, preserving the first immutable receipt without hiding a later
  outcome.
- Define one server-side `eligible_external` path with explicit exclusions for
  fixtures, staff, and automation. Name it honestly; do not call it verified
  human traffic if that is not proven.
- Replace the Stage 4 fixture claims with isolated database/route tests that
  actually cover: positive and every single failed gold gate, approval and
  rejection replay, full binding-field cross-target replay, concurrent terminal
  review, contradictory receipt races, failed-attempt retry with a new ID,
  and absence of both `comparison_ready` and
  `verified_comparison_created` whenever gold fails.

## Required Read-Only Bundle

Export one repeatable-read, read-only, rolled-back bundle containing:

- exact canonical behavioral and gold rosters plus named gate evidence;
- a machine comparison proving exporter output equals direct database-function
  output for every exported dish;
- old/new same-snapshot selector rows with both photo IDs and both complete
  pass/fail states, plus the resulting population delta;
- a stable aggregate explanation of the Stage 3 3,912 to Stage 4 3,881 drift;
- all attempt binding and analysis-eligibility fields, sanitized;
- attempts and immutable receipts, which may remain empty while treatment is
  off; and
- isolated test results tied to test names and assertions, not summary labels.

Include hashes, exporter commit, schema, exact queries, redaction report, and
aggregate geography. No hidden national identities.

## Exit Gate

Push 5 passes only if independent DataLab recomputation finds zero
exporter/runtime/database contract disagreements and the isolated adversarial
matrix passes. Passing authorizes a separate, tightly capped live pilot
proposal; it does not itself authorize treatment, conversion claims, or
coverage claims.

## Boundaries

Do not enable treatment, touch the national holdout, fetch new source data,
alter acquisition, add ghost-kitchen/opening-recency requirements, or broaden
the UI. Do not claim any data improvement from fixtures or migrations.
