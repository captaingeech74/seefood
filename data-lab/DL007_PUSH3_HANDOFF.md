# DL-007 Push 3 — Main Developer Instruction

Continue DL-007 as a main-thread-owned Stage 3 hardening and qualification
cycle. Do not ask Kyle to relay messages. Keep the treatment prompt disabled.
Stage 2 has 5,048 mechanical dish candidates across 69 restaurants, zero
qualified targets, zero attempts, and zero funnel events. Exactly 4,876
candidates across 67 restaurants fail only the exporter's recorded
Management-rights gate, but the other gate labels were not independently
proven.

Before any behavioral pilot:

1. Enforce the attempt-target invariant server-side. Load the existing attempt
   and reject every upload or idempotent replay whose restaurant, menu item,
   experiment, variant, or surface differs. Add direct tests for cross-dish and
   cross-restaurant replay.
2. Separate two explicit target classes:
   - `behavioral_prompt_candidate`: an active/non-team restaurant and genuinely
     current, orderable, stable known dish suitable for measuring contribution
     behavior; and
   - `gold_comparison_candidate`: the full Benchmark requirements, including
     independently supported Management provenance, exact/strong attachment,
     usefulness, duplicates, and the recorded rights scope.
   Never count the first class as coverage. Do not call an impression eligible
   unless the server confirms its declared class.
3. Correct target evidence and names. Use a real freshness observation and
   orderability signal instead of equating both to `menu_items.active`;
   reconcile entity `status`, `operating_status`, and restaurant status;
   preserve exact source-family and provenance basis; evaluate all candidate
   photos before choosing the best passing one; and label exact-hash,
   perceptual-hash, and independently reviewed duplicate evidence separately.
4. Make receipts first-write-preserving and auditable. Record native file-picker
   cancellation where supported, server optimization failure, post-storage
   target invalidation, storage/record failure, and every audit-write failure.
   A successful upload path must not silently lose an authoritative receipt.
5. Implement and test the controlled terminal review transition. It must record
   moderation, exact/strong item match, duplicate review, the applicable rights
   scope, publication eligibility, and `verified_comparison_created`; it must
   activate/publish nothing unless every required gate passes.
6. Preserve the exact versioned consent text and intended-use scope. The
   existing v1 language supports display with the dish only. Do not label it as
   derivative-label, model-training, sublicensing, or broader retention
   permission unless product/legal supplies approved language. DataLab must not
   draft or approve that legal grant.
7. Add direct tests for the corrected target query, target-class enforcement,
   attempt binding and replay, immutable idempotency, native/client/server
   failure receipts, pending/nonpublic defaults, terminal review transitions,
   and fixture/staff/automation exclusion.
8. Produce a sanitized forced-read-only Stage 3 bundle at
   `data-lab/raw/baseline/DL-007/main-thread-stage3`. Include hashes, exact code
   and query lineage, corrected dual target rosters, all gate bases and failed
   gates, and a deterministic externally stable sample of at most 100 of the
   4,876 rights-only candidates. For that sample include at most one bounded
   evidence image per dish plus source-family, observation/freshness,
   provenance, rights-scope, item-link, accessibility, usefulness, and duplicate
   evidence sufficient for a blind Guardian audit. Preserve failures; do not
   approve rights from nonempty metadata.

Deploy only the passive safety/measurement corrections through the main
thread's normal authorized workflow. Do not enable the treatment, manufacture
events, rewrite historical records, access or reveal the locked national
holdout, make paid calls, send messages, or claim conversion or coverage.
Return the Stage 3 bundle path, `SHA256SUMS` hash, exact main/exporter commit,
tests/typecheck/build results, deployment state, and a plain statement that the
treatment remains disabled.
