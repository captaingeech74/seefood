# DL-007 — First-Party Contribution Funnel, Stage 2

## Decision

**Revise. Keep the treatment disabled.**

Stage 2 successfully installed several important safety and measurement
foundations, but it produced zero independently qualified dish targets and its
audit chain cannot yet support a behavioral pilot or reach a verified
comparison reliably.

Verified coverage improvement remains zero.

## Bound And Inputs

DataLab inspected only:

- the sanitized read-only bundle at
  `data-lab/raw/baseline/DL-007/main-thread-stage2`;
- Git objects through main commit
  `ebda99f51dd094a697815caad52eacaeae156c79`; and
- a disposable archive of that commit for local tests.

DataLab did not access production, the locked national holdout, Vercel, R2,
credentials, or paid services and did not deploy or change main.

## Integrity

The supplied `SHA256SUMS` file hashes to
`9405ffc06311a71b0a247ad4e0290abad1a51fd376405574de867f3538cec8a5`.
Every listed file hash passed and the manifest exporter commit matches the
handoff.

The snapshot reports repeatable-read/read-only state before and after, one
unchanged transaction timestamp, and terminal `ROLLBACK`. WAL advanced during
the read-only transaction; that can reflect unrelated concurrent database
activity and is neither treated as proof of a DataLab write nor described as
unchanged.

Reproduce the local arithmetic with:

```sh
node data-lab/scripts/evaluate-dl007-stage2.mjs \
  data-lab/raw/baseline/DL-007/main-thread-stage2
```

## Reproduced Bundle Result

| Measure | Result |
|---|---:|
| Dish-candidate rows | 5,048 |
| Distinct entities/restaurants | 69 |
| Distinct selected Management photos | 5,026 |
| Qualified dish targets | 0 |
| Contribution attempts | 0 |
| Funnel events | 0 |
| Verified comparisons created | 0 |

Every one of the 5,048 candidates fails the stored reviewed-rights gate.
Exactly 4,876 candidates across 67 restaurants fail only that recorded gate
under the exporter's other database-derived tests. This is a promising
mechanical inventory, not 4,876 qualified targets.

Other recorded gate failures overlap:

- 167 lack the exporter's robust-duplicate evidence;
- 64 fail its active/useful Management-photo test; and
- 36 fail its active/non-test entity test.

The remaining gate labels are stronger than their evidence:

- `currentOrderableItem` is only `menu_items.active`; there is no benchmark
  freshness observation or independent orderability signal;
- `explicitProvenance` means three metadata fields are nonempty, not that
  provenance was independently established;
- duplicate uniqueness is restaurant-local exact-hash evidence plus a stored
  perceptual hash, not a completed near-duplicate review;
- entity eligibility uses `restaurant_entities.status` without reconciling
  `operating_status` and restaurant status; and
- the top Management photo is selected before gates are applied, so a failing
  top-ranked photo can hide a better photo for the same dish.

No evidence images or source/rights lineage were included because no candidate
passed the stored rights gate. The 4,876 near-targets therefore remain
unaudited.

## Legacy Traffic

The corrected bundle preserves all 106 legacy events but authorizes none for
behavioral analysis:

- 38 app-open rows from five opaque browser identifiers;
- 68 photo-view rows;
- 29/38 app-open rows and 40/106 total rows are fixture traffic; and
- the remaining nine app-open rows are `public_unverified`, not verified
  non-team user exposures.

This is honest and fixes the misleading Stage 1 denominator. Conversion remains
unmeasurable.

## Implementation Findings

### What improved

The main implementation now has:

- a stable menu-item field in the known-dish client request;
- UUID contribution attempts and one photo per attempt;
- a versioned consent surface;
- named client and server funnel receipts;
- server errors for important successful-path audit failures;
- inactive, unpublished new submissions;
- pending moderation, item-match, and duplicate states; and
- treatment still disabled.

An independent disposable checkout passed all 73 tests and TypeScript after
installing the commit's locked dependencies. The production build compiled and
typechecked locally, then stopped during page-data collection solely because
the disposable checkout intentionally lacked Supabase environment variables.
The supplied main-thread production build and device verification were not
repeated against live systems by DataLab.

### What blocks activation

1. The upload endpoint does not verify that an existing attempt is bound to the
   submitted restaurant/menu-item tuple. A valid attempt for one dish can be
   replayed against another; the existing-photo replay path also skips this
   binding check.
2. `eligible_prompt_impression` is emitted for any open detail view with an
   active menu item. It does not require a qualified target, so its name and
   future denominator would be false.
3. Staff exclusion is not affirmative. A request header can mark traffic as
   staff or automation, but `public_unverified` does not prove that remaining
   traffic is non-team.
4. Native file-picker cancellation is not recorded. Some optimization,
   post-storage invalidation, duplicate-receipt, and failure-event write paths
   also remain incomplete or fail open.
5. Event upserts can replace the original outcome and timestamp rather than
   preserving the first immutable receipt.
6. The schema names terminal review events, but no review transition writes
   approved/rejected item-match and moderation results or
   `verified_comparison_created`. Submissions can enter pending review but the
   audited implementation cannot complete the funnel.
7. The v1 checkbox grants display with the dish. It does not establish broader
   derivative-label, model, sublicensing, or retention rights. Its scope must
   be recorded honestly; DataLab will not invent legal language.
8. Only four funnel unit tests were added. Attempt-target binding, exact target
   query semantics, immutable idempotency, endpoint failures, and terminal
   review transitions lack direct tests.

## Interpretation

Stage 2 is a technical success but not an experiment success. It created a
safer intake foundation and exposed a large possible target pool. It did not
create a valid treatment denominator, a verified target, a Customer photo, or
a comparison dish.

The all-rights failure should not automatically kill a behavioral prompt test:
behavioral eligibility and gold comparison eligibility are different. Push 3
must model them separately. A display-only or otherwise limited Management
source can support a carefully labeled behavior test without receiving
comparison-coverage credit. No live treatment should begin until the server
binding, denominator, failure receipts, review completion path, and bounded
candidate audit pass.

## Cost And Safety

- Money: $0.
- DataLab production reads/writes: 0.
- Paid calls: 0.
- Images downloaded by DataLab: 0.
- Main changes/deployments by DataLab: 0.
- Hidden national identities accessed: 0.

