# DL-007 — First-Party Contribution Funnel, Stage 4

## Decision

**Revise. Keep the treatment disabled.**

Stage 4 materially hardened terminal review, Customer consent, attempt binding,
and immutable first receipts. The candidate-photo evidence is also much
stronger than before: after blind judgments were frozen, all 100 supplied
images were exact or strong matches to their revealed menu item.

Stage 4 still does not provide one identical eligibility and gold contract
across the exporter, runtime, and database. A live conversion denominator would
therefore not be trustworthy. Verified coverage improvement remains zero.

## Bound And Integrity

DataLab inspected only the sanitized read-only bundle at
`data-lab/raw/baseline/DL-007/main-thread-stage4`, Git objects through main
commit `1a21d5520efc8494080fb35f40528b9840c2841a`, and a disposable archive of
that commit. It did not access production, Vercel, R2, credentials, the hidden
national holdout, or paid services.

The supplied `SHA256SUMS` file hashes to
`7256b48109d765573a9997d6e74f49d927da9e800ef53858c6a5c54fbb809833`.
Every listed file passed. The manifest records repeatable-read/read-only state
before and after the snapshot and terminal `ROLLBACK`.

Reproduce the mechanical checks with:

```sh
node data-lab/scripts/evaluate-dl007-stage4.mjs \
  data-lab/raw/baseline/DL-007/main-thread-stage4
```

## Reproduced Result

| Measure | Result |
|---|---:|
| Dish rows | 5,048 |
| Restaurants/entities | 69 |
| Behavioral prompt candidates | 4,004 across 57 restaurants |
| Gold comparison candidates | 0 |
| Prior-contract rights-only rows | 4,882 |
| Behavioral and prior-rights intersection | 3,881 |
| Blind sample | 100 rows across 43 restaurants |
| Real attempts / receipts | 0 / 0 |

The Stage 3 intersection was 3,912. The new snapshot contains 3,881, a decline
of 31 attributable in the aggregate to snapshot/freshness changes, not a data
loss proven at row level. The bundle does not supply a stable cross-snapshot
bridge.

The 54-row reconciliation ledger proves that the old and corrected selectors
chose different photo IDs for 54 dishes in the Stage 4 snapshot. It does not
reproduce the prior 4,876-to-4,882 population correction because it omits each
old and new photo's pass/fail state.

## Blind Item Audit

The Lead reviewed four neutral contact sheets in filename order without dish
names. The frozen judgment file hashed to
`e15b56aea11aa07d35fb1a3f686c8d7d5ae9687a4cce687fb46395f6b91039d5`
before labels were opened.

Blind review classified 92 images as clearly useful for one orderable item,
seven as conditional composite/assortment images, and one refrigerator
assortment as a reject without label context. After unblinding, every
conditional image and the assortment matched the complete product being sold.
The final item audit is 100/100 exact or strong matches, with a 95% Wilson
interval of 96.30%–100%.

This is strong evidence that the selected Management catalog images and item
labels align in this packet. It does not prove rights, original Management
authorship, Customer supply, conversion, national yield, or national
generalization. All rows are from one Pacific development market.

## Implementation Audit

Accepted improvements:

- terminal review locks the attempt and photo and is one-shot;
- missing stored Customer consent cannot be repaired by the reviewer;
- the first outcome for one attempt/event/source is immutable;
- upload binding includes restaurant, menu item, visitor, session, experiment,
  variant, surface, and target class; and
- fixture tests cover a positive approval, exact duplicate rejection, missing
  consent, a failed-gold case, and one first-receipt concurrency case.

Remaining blockers:

1. The exporter still computes separate JavaScript gold gates, hard-codes
   provenance review to false, and can grade a different photo from the SQL
   function. Its claimed parity test never compares those outputs.
2. Runtime prompt eligibility does not verify the latest successful source
   snapshot, while the exporter says it does.
3. Management rights lack an independent review/audit state, and source
   lineage is not strictly bound to the restaurant entity and source.
4. The all-photo selector does not rank on every provenance, hash, and
   duplicate gate, so a lower fully passing photo can remain hidden.
5. The fixture report overstates its proof. It omits rejected-review replay,
   database/route cross-target replay, a gold-gate failure matrix, explicit
   absence of comparison events, and exporter-to-SQL parity.
6. Immutable failure receipts conflict with retrying the same attempt. A retry
   must use a new attempt or an explicitly modeled retry ordinal.
7. Public traffic can only be `unverified`; there is no positive
   `eligible_external` denominator.

## Independent Evaluation

A fresh Benchmark Guardian and Adversarial Verifier independently reached the
same decision: bundle integrity passes and the state machine improved, but the
pilot is not ready. A disposable checkout passed 80 tests, TypeScript, and a
production build using inert placeholder environment values. DataLab inspected
the supplied isolated-database result but did not receive a database fixture it
could rerun.

## Cost And Impact

- Money: $0.
- Production writes, deployments, or main changes by DataLab: none.
- Paid calls or external image downloads by DataLab: none.
- Verified new comparison dishes: 0.
