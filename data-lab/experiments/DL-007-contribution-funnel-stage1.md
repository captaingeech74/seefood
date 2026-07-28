# DL-007 — First-Party Contribution Funnel, Stage 1

## Decision

**Revise. The bundle establishes zero creditable first-party Customer
contributions and exposes the missing measurement work. It does not measure
prompt conversion, and its 89 entity-level candidates are not yet qualified
dish-level targets.**

No acquisition or coverage improvement is claimed.

## Hypothesis

SeeFood's own targeted Management and Customer prompts can close the comparison
gap more cheaply than another automatic source and can scale nationally.

This is a national hypothesis. Temecula may validate the workflow, but a
Temecula-only gain cannot pass the experiment.

## Stage 1 Bound

Stage 1 used only the sanitized bundle at
`data-lab/raw/baseline/DL-007/main-thread-stage1`. It permitted local parsing,
hash verification, aggregate recomputation, and independent review. It
prohibited production access or writes, deployment, main-branch changes,
messages, accounts, paid calls, and hidden-holdout disclosure.

The main thread identified exporter commit
`0a9112f8c0a8e57ac852a29e3e42d103ebe6eda1`. The bundle manifest separately
records `1568b978e97e343633cab679374625392df108e4` as `mainCommit`. Stage 1 records
both values without treating them as interchangeable.

## Integrity And Reproducibility

The supplied `SHA256SUMS` file hashes to
`fb99de3a2643c1384e157ae64a60cb87e8db90eba0c9de891a1b8463f52b7b37`,
exactly matching the handoff. All ten listed file hashes passed.

The manifest records one `REPEATABLE READ READ ONLY` transaction ending in
`ROLLBACK`. Read-only state remained on, the transaction timestamp was
unchanged, and WAL position was unchanged. The redaction report and an
independent scan found no names, contact details, URLs, credentials, raw
metadata, images, or hidden national identities.

Reproduce the evaluation with:

```sh
node data-lab/scripts/evaluate-dl007-stage1.mjs \
  data-lab/raw/baseline/DL-007/main-thread-stage1
```

## What The Bundle Actually Shows

### Contribution supply

- 106 event rows: 38 `app_open`, 68 `photo_view`, and zero `photo_add`;
- four stored first-party Customer-classified photo records;
- all four photo records belong to a test-fixture entity;
- all four have unreviewed rights and no supplied content/perceptual duplicate
  evidence; and
- after correct fixture exclusion: zero real uploads, zero contributors, zero
  attached contributions, zero mechanically comparison-ready contributions,
  and zero restaurants improved.

The four fixtures prove that the upload storage path has been exercised. They
are not users, coverage, or conversion.

### Mechanical targeting frame

The bundle contains 170 unique non-test entities having at least a menu,
Management-classified photo, or direct first-party Customer photo:

| Mechanical condition | Entities |
|---|---:|
| Active-record menu | 99 |
| Management-classified photo | 160 |
| Both menu and Management-classified photo | 89 |
| Direct first-party Customer photo | 0 |
| Verified first-party Customer photo | 0 |

The 89 count exactly reproduces the exporter formula:
`hasCurrentMenu && hasManagementPhoto && !hasVerifiedCustomerPhoto`.

It is not yet the number of restaurants one Customer photo away from a verified
comparison. The export does not prove restaurant operating status, menu
freshness or orderability, accessible and useful image evidence, reviewed
Management provenance and rights, exact or strong dish attachment, or duplicate
clearance. It is also entity-level co-occurrence, not dish-level pairing.

### Traffic contamination

The published aggregate included fixture traffic. The one fixture entity
associated with the four excluded photos generated:

- 40/106 events;
- 29/38 app opens; and
- 11/68 photo views.

Removing only that known fixture leaves at most nine visits, three visitor
tokens, and eleven sessions. Those are upper bounds, not verified human traffic,
because the remaining event rows do not carry entity status or an
evaluation-eligibility flag. Sixteen of the 38 app opens predate session IDs,
and three distinct sessions appear only on other event types, so the reported
25 sessions are not 25 complete visit funnels.

### Missing funnel

The app currently records a successful `photo_add` event only after the upload
API returns success. The client event is fire-and-forget, and the event endpoint
swallows database-write failures while still returning 204. It does not record:

1. eligible prompt impression;
2. prompt open;
3. file picker or upload start;
4. cancellation or client optimization failure;
5. upload API success or failure authoritatively;
6. moderation and rights acceptance;
7. current-item attachment and duplicate clearance; or
8. independent comparison verification.

The current known-dish upload sends a dish name rather than a stable menu-item
target. The missing-dish flow is a different supply problem and cannot be
pooled with known-dish Customer contributions. Existing contribution records
also default to approved/active while rights remain unreviewed. Those mechanics
must be corrected before raw submissions can be counted or displayed.

Therefore zero observed uploads is not a measured 0% conversion rate. There is
no exposure denominator and far too little verified traffic.

## Paper Experiment

The behavioral test must not start until Stage 2 supplies qualified dish-level
targets and the complete privacy-safe funnel.

Stage 2 and the first pilot cover only the known-current-dish Customer flow.
Management contributions and missing-dish suggestions require separate
experiments.

Eligible treatment unit:

- active, non-test, non-demo restaurant;
- current orderable menu item;
- accessible, useful, independently exact/strong Management photo with reviewed
  provenance, rights, and duplicate status;
- no verified Customer photo on that same dish.

Primary metric:

`verified new comparison dishes / eligible prompt impressions`.

An upload counts only after moderation, rights, exact/strong item match,
current-menu attachment, duplicate clearance, and independent review. Raw
uploads and entity-level co-occurrence do not count.

Recommended first live bound after instrumentation validation:

- deterministic visitor-level control/treatment assignment;
- unchanged current experience as control;
- one explicit dish-specific Customer-photo prompt as treatment;
- no PII in analytics and no outreach or SMS;
- stop at 100 eligible treatment impressions across at least 50 non-team
  browser identifiers and 20 audited entities, 30 days, or 30 uploaded images,
  whichever bound is reached first;
- treat zero accepted comparisons at 100 impressions as an unsuccessful first
  pilot, with a one-sided 95% upper conversion bound of about 2.95%, not as a
  final falsification of every contribution design; and
- no national scaling claim without distribution across a locked,
  representative national evaluation slice.

These are preregistered scenarios, not evidence that present traffic can reach
the bound.

## Result Against The Gate

| Gate | Result |
|---|---|
| Bundle integrity and read-only provenance | Pass |
| Zero creditable existing contributions | Pass, independently reproduced |
| Mechanical entity target formula | Pass: 89 |
| Gold-qualified dish-level target roster | Fail / not supplied |
| Fixture-free traffic denominator | Fail |
| Complete prompt-to-verification telemetry | Fail |
| Behavioral conversion estimate | Not measurable |
| National scaling evidence | Not measured |
| Verified coverage improvement | 0 |

## Next Action

Push 2 must correct the evidence frame before any prompt result is interpreted:

1. attach status and fixture/internal/demo eligibility to every event and
   recompute all windows after exclusions;
2. replace the 89 entity-level count with a deterministic dish-level roster
   that supplies the missing qualification fields and bounded evidence;
3. make the known-dish submission carry a stable current menu-item target,
   explicit versioned rights grant, pending/nonpublic initial state, and
   authoritative server receipts;
4. add privacy-safe funnel instrumentation from eligible impression through
   authoritative upload result and verified comparison outcome; and
5. return a sanitized read-only Stage 2 bundle plus tests and exact query/code
   lineage.

Do not launch or judge an A/B prompt trial from the Stage 1 numbers.

## Cost And Safety

- Money: $0.
- External requests and paid calls: 0.
- Production access or writes by DataLab: 0.
- Images downloaded: 0.
- Hidden national identities disclosed: 0.
- Main changes, deployment, merge, and push by DataLab: 0.
