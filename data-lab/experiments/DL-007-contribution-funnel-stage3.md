# DL-007 — First-Party Contribution Funnel, Stage 3

## Decision

**Revise. Keep the treatment disabled.**

Stage 3 fixed the Stage 2 attempt-replay defect and materially improved the
measurement model. It also produced the first bounded image evidence for the
candidate pool. It still cannot safely create a verified comparison or support
a live behavioral experiment.

Verified coverage improvement remains zero.

## Bound And Inputs

DataLab inspected only:

- the sanitized read-only bundle at
  `data-lab/raw/baseline/DL-007/main-thread-stage3`;
- Git objects through main/exporter commit
  `51013a83716d85d246e4582e8778fc8c6a13b8c4`; and
- a disposable archive of that commit for local tests.

The independent visual review was bounded to the supplied 100 WebP evidence
images. DataLab did not access production, Vercel, R2, the locked national
holdout, credentials, or paid services and did not deploy or change main.

## Integrity And Reproduction

The supplied `SHA256SUMS` file hashes to
`e1dd7d08222b0f245ea740b9c8ac5e2288243d76d67971d48dbaf77f95e5e1dc`.
Every listed file passed. The exporter commit matches the handoff. The snapshot
reports repeatable-read/read-only state before and after, one unchanged
transaction timestamp, and terminal `ROLLBACK`.

All 100 evidence files decoded as WebP, matched their row hashes, and contained
no EXIF, ICC, or XMP payload.

Reproduce the bundle arithmetic and image checks with:

```sh
node data-lab/scripts/evaluate-dl007-stage3.mjs \
  data-lab/raw/baseline/DL-007/main-thread-stage3
```

## Reproduced Target Result

| Measure | Result |
|---|---:|
| Dish rows | 5,048 |
| Restaurants/entities | 69 |
| Behavioral prompt candidates | 4,036 across 58 restaurants |
| Gold comparison candidates | 0 |
| Contribution attempts | 0 |
| Contribution receipts | 0 |

Behavioral exclusions overlap: 974 rows fail active restaurant/entity status
and 38 fail the exporter's orderability signal. No row failed its 30-day menu
observation test.

Every row fails reviewed display rights, independent Management provenance
review, and independent near-duplicate review. Other gold failures include 166
restaurant-local exact-hash collisions, 47 missing perceptual hashes, 69
missing source-snapshot lineage, ten active/useful-photo failures, and ten
recorded duplicate-parent/reason failures.

Behavioral eligibility is correctly separate from gold comparison eligibility.
The 4,036 rows are possible prompt surfaces, not coverage.

## Stage 2 Versus Stage 3 Selection

The Stage 2 top-photo-first method reported 4,876 rows failing only its stored
rights gate. Stage 3's corrected all-attached-photo ranking reports 4,882:
six additional rows, a 0.12% measurement correction.

The correction is plausible and important to preserve. Only 69/5,048 dishes
had more than one candidate Management photo, so selection could affect only
those dishes. Stage 3 prioritized an active, approved, accessible,
non-storefront, item-attached photo before rights and quality instead of
allowing the old top choice to hide a better one.

This is not new data or coverage. The exact six-row attribution cannot be
independently reconciled because Stage 2 and Stage 3 use different snapshot
times, opaque seeds, and ordering salts and provide no same-snapshot delta
ledger.

## Blind 100-Image Audit

The sample contains 100 distinct selected photos across 47 restaurants:

- DoorDash: 94;
- Grubhub: 4; and
- Schema.org: 2.

Only 79/100 sampled rows are behavioral candidates; 21 fail the corrected
behavioral gates. Across the full bundle, 3,912 rows are in both the 4,882
corrected prior-contract rights-only population and the behavioral candidate
population. The packet samples the broader prior-contract population, not that
intersection.

Visual review found:

- 99/100 images plausibly depict an orderable food or beverage product;
- one clear reject depicts packaged plastic cutlery rather than food or drink;
- no obvious byte or visual duplicate within the 100-image packet; and
- strong overall catalog-image quality, heavily dominated by DoorDash.

This does not establish 99% gold usefulness or item-match precision. The packet
withholds expected dish names/descriptions, so no image can be independently
graded exact/strong against its menu item. It also cannot prove original
Management authorship, display rights, or corpus-wide near-duplicate status.
The DoorDash-dominated, 47-restaurant sample is not a representative national
evaluation.

## Implementation Findings

### What Stage 3 fixed

- Upload and idempotent replay now check the stored attempt's restaurant,
  menu item, experiment, variant, and surface.
- Behavioral and gold target classes are separated.
- The known-dish API rejects non-behavioral targets.
- Menu observation freshness, restaurant/entity status, and missing-streak
  signals are now explicit.
- Consent is explicitly versioned and scoped to display with the dish.
- Repeated identical receipts are insert-ignore rather than overwrite.
- Native file-input cancellation and additional server failure stages exist.
- New photos remain inactive and pending.
- A database function performs the review update inside one transaction.

An independent disposable checkout passed all 79 tests and TypeScript using
the commit's locked dependencies.

### What still blocks activation

1. `review_contribution_photo` can emit `verified_comparison_created` using a
   Management counterpart materially weaker than the exporter's gold contract.
   It omits current/fresh/orderable restaurant-menu checks, successful
   source-snapshot lineage, independent provenance review, restaurant-local
   exact-hash uniqueness, and independently reviewed duplicate status.
2. The function does not explicitly ensure the Management and Customer images
   are distinct under exact and near-duplicate evidence.
3. A rejected photo remains inactive/unpublished and can be terminally reviewed
   again into an approved state. The transition is atomic but not one-shot.
4. The reviewer can supply `display_with_dish` when a stored photo has no rights
   scope because the SQL uses `coalesce(stored_scope, supplied_scope)`. Stored
   consent must be exact; review must not repair it.
5. Receipt uniqueness includes outcome. Contradictory outcomes for the same
   attempt/event/source can coexist, and repeat terminal reviews can create
   conflicting review receipts.
6. The existing-attempt path in `createContributionAttempt` does not compare
   stored experiment, variant, surface, and target class, even though the
   upload path now does.
7. Traffic classification is still not server-authoritative enough for a clean
   denominator. `public_unverified` is not affirmative non-team traffic.
8. `menu_active && missing_streak=0` is evidence that an item was not missing
   from the latest source, not proof of live orderability. The label must stay
   narrow.
9. Attempts and receipts are both empty. The runtime state machine remains
   unexercised; current tests are primarily unit and migration-text checks.

## Interpretation

Stage 3 is useful progress. It confirms thousands of possible contribution
surfaces and strong catalog-photo appearance in a bounded sample. It does not
prove prompt conversion, exact item matching, Management rights/provenance, a
national flywheel, or a verified comparison.

The next cycle should make the review state machine and comparison predicate
honest, then provide the missing label-plus-image audit on the behavioral
intersection. A live treatment before that would create a denominator around a
workflow that can still overstate its terminal result.

## Cost And Safety

- Money: $0.
- External image reads by DataLab: 0; the 100 supplied images were local.
- DataLab production reads/writes: 0.
- Paid calls: 0.
- Main changes/deployments by DataLab: 0.
- Hidden national identities accessed: 0.
