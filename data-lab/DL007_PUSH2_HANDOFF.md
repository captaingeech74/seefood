# DL-007 Push 2 — Main Developer Instruction

Continue DL-007 as a main-thread-owned Stage 2 measurement fix. Do not ask Kyle
to relay messages. DataLab Stage 1 independently found zero creditable real
Customer-photo contributions, not a 0% conversion rate: 29/38 app-open rows
came from one known fixture entity, the remaining traffic cannot be fully
eligibility-filtered, no prompt-exposure funnel exists, and the 89 reported
targets are entity-level mechanical candidates rather than qualified dishes.

Implement and validate the smallest safe known-current-dish Customer-photo
funnel. Do not combine it with Management uploads or missing-dish suggestions.

1. Build a deterministic dish-level target query. A target must be an active,
   non-test/non-demo restaurant with a current orderable menu item; an
   accessible, useful, nonduplicate Management photo independently attached to
   that exact/strong-matched item with explicit provenance, moderation, and
   reviewed rights; and no verified Customer photo on that same dish. Preserve
   every failed gate explicitly. Do not call the existing 89 entities
   qualified.
2. Correct event eligibility. Every exported event must carry sanitized entity
   status plus test/internal/demo/automation/staff eligibility sufficient to
   exclude ineligible traffic. Report `app_open` as app-open rows/browser
   identifiers, not restaurant visits or people. Keep session denominators
   compatible.
3. Instrument an auditable privacy-safe chain for the known-dish flow:
   eligible prompt impression, prompt open, photo-source choice, file selected
   or cancelled, client preparation result, server upload request received,
   storage result, photo-record result, explicit versioned rights grant,
   moderation result, exact/strong item-match result, duplicate result, and
   verified comparison created. Give each attempt an idempotent opaque attempt
   ID and retain experiment, variant, surface, session, and stable opaque
   menu-item target. Server receipts must be authoritative and event-write
   failures observable.
4. Change known-dish submission to send a stable current menu-item target.
   New submissions must remain pending and nonpublic until rights, moderation,
   exact/strong item match, and duplicate review pass. Do not log or export
   names, contact data, coordinates, URLs, free text, raw metadata, image bytes
   outside the bounded evidence folder, credentials, or hidden national
   identities.
5. Add tests covering event allowlists/schema, idempotency, server failure
   observability, stable item attachment, versioned rights, pending/nonpublic
   defaults, fixture/staff/automation exclusion, and the exact target query.
   Keep any treatment prompt disabled; do not start the behavioral A/B pilot
   until DataLab validates Stage 2.
6. Through the main thread's normal reviewed workflow, ship the passive
   measurement and safety corrections if authorized there. Do not manufacture
   events or rewrite historical records.
7. Produce a sanitized, forced-transaction-read-only bundle at
   `data-lab/raw/baseline/DL-007/main-thread-stage2`, ending in rollback. Include:
   exact queries and code commit; manifest, hashes, schema fingerprint, and
   redaction report; corrected all-time/90/30/7-day event aggregates; the
   deterministic dish target roster and every gate result; at most one bounded
   Management evidence image per candidate for no more than 100 candidates;
   full deterministic ranks; instrumentation schema and deployed/disabled
   state; and synthetic or fixture-only end-to-end validation clearly separated
   from real users and coverage.

Do not access or reveal the locked national holdout, make paid calls, send
messages, start the prompt experiment, or claim coverage improvement. Return
the Stage 2 bundle path, SHA256SUMS hash, exporter/main commit, test results,
deployment state if any, and a plain statement that no behavioral conversion
claim is yet authorized.
