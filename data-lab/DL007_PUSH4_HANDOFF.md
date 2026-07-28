# DL-007 Push 4 — Main Developer Instruction

Continue DL-007 as a main-thread-owned Stage 4 terminal-integrity and
label-plus-image qualification cycle. Do not ask Kyle to relay messages. Keep
the treatment disabled.

Stage 3 independently verified 5,048 dish rows, 4,036 behavioral candidates
across 58 restaurants, zero gold candidates, zero attempts, and zero receipts.
The corrected all-photo selection reports 4,882 prior-contract rights-only rows
versus Stage 2's 4,876. Preserve the six-row correction as measurement only.

Before any live behavioral pilot:

1. Create one canonical database predicate for a gold Management counterpart
   and use that exact predicate in both the exporter and terminal review.
   It must cover active restaurant/entity and nonclosed operating state, a
   genuinely current menu item, the narrowly named latest-source/orderability
   evidence, accessible useful Management image, successful source lineage,
   independently reviewed Management provenance, reviewed display-rights
   scope, exact/explicit item attachment, exact-hash uniqueness, independently
   reviewed near-duplicate status, no duplicate parent/reason, and a distinct
   Management image from the submitted Customer image. If the predicate fails,
   never set `comparison_ready` or emit `verified_comparison_created`.
2. Make terminal review genuinely one-shot. Lock and require the attempt to be
   `pending_review` and all review fields pending. A rejected or verified
   attempt cannot be reviewed again inside DL-007. Require the photo's stored
   `rights_status`, version, and `rights_scope=display_with_dish` exactly; never
   repair missing consent from reviewer input.
3. Prevent contradictory receipts for the same attempt/event/source. Preserve
   an immutable first receipt, while modeling legitimate server-pending to
   reviewer-final transitions as different sources or explicit transition
   records. Add concurrency and replay coverage.
4. Enforce every existing-attempt binding field in the receipt path:
   restaurant, menu item, visitor/session where applicable, experiment,
   variant, surface, and target class.
5. Make staff/test/automation exclusion server-authoritative enough for a
   bounded experiment and record a distinct analysis-eligibility decision.
   Do not treat a client-asserted header or `public_unverified` alone as proof
   of non-team human traffic.
6. Rename the current orderability signal to what it proves:
   active item observed with zero missing streak in the latest successful
   source. Do not call it live orderability without a separate availability
   signal.
7. Add database integration tests in an isolated test database for first
   receipt concurrency, cross-target replay, one-shot approval/rejection,
   stored-consent enforcement, Customer-versus-Management duplicate rejection,
   canonical gold-predicate parity, and no comparison event when any gold gate
   fails. Do not exercise these writes against production.
8. Produce a sanitized forced-read-only Stage 4 bundle at
   `data-lab/raw/baseline/DL-007/main-thread-stage4` containing:
   - hashes and exact code/query lineage;
   - corrected behavioral and gold rosters;
   - a same-snapshot Stage-2-versus-Stage-3 selection reconciliation ledger
     using one stable opaque join, listing every changed row and reason;
   - a deterministic sample of at most 100 rows drawn only from the 3,912-row
     intersection of behavioral candidates and the corrected prior-contract
     rights-only population;
   - one sanitized image plus sanitized expected menu-item name and, when
     needed, description for each sampled row;
   - source-family/snapshot lineage, provenance basis, rights scope,
     item-link basis, exact/perceptual duplicate evidence, and every failed
     gate;
   - aggregate candidate geography by Census division and market-size tier
     without names, coordinates, or locked-holdout identities; and
   - fixture-only end-to-end state-machine results clearly separated from real
     attempts, conversion, and coverage.

Do not approve provenance or rights from metadata alone. Do not enable the
treatment, manufacture real-user events, rewrite historical records, access or
reveal the locked national holdout, make paid calls, send messages, or claim
conversion or coverage. Deploy only passive safety/measurement corrections
through the main thread's normal authorized workflow. Return the Stage 4 bundle
path, `SHA256SUMS` hash, exact main/exporter commit, isolated database-test
results, full tests/typecheck/build results, deployment state, and a plain
statement that the treatment remains disabled.
