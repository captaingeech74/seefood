# DL-001 Sanitized Input Handoff

## Purpose

This is the exact input required to resume DL-001 without giving the DataLab
production credentials or customer personal data. The main SeeFood thread owns
the export. The DataLab must not obtain credentials, call `/api/dishes`, or
fetch missing evidence itself.

Place the completed bundle under:

`data-lab/raw/baseline/DL-001/`

That path is ignored. Nothing in the bundle is committed.

## Safety Requirements

The main thread must:

1. export from one database transaction explicitly opened with
   `BEGIN TRANSACTION READ ONLY` at repeatable-read isolation;
2. attest that no route, RPC, trigger, cache fill, or storage operation can
   write;
3. export at most 120 photo/evidence records;
4. remove credentials, tokens, contributor identifiers, names, phone numbers,
   email addresses, free-text customer content, device/session IDs, payment
   data, and precise personal timestamps;
5. provide bounded local image renders or bytes and source/menu evidence so the
   Guardian does not need a live fetch; and
6. provide SHA-256 hashes and a redaction log for every exported file.

If any requirement cannot be met, do not export and leave DL-001 stopped.

## Candidate Metadata

Export every eligible Temecula candidate needed to reproduce the buckets—not a
handpicked 12—with:

- stable restaurant and entity IDs;
- public restaurant name;
- coordinates and Temecula inclusion decision;
- entity/restaurant operating and test-fixture status;
- active current-menu item count;
- active useful-photo candidate count;
- SQL-claimed comparison-dish count;
- stored `comparison_ready` photo count;
- exact SQL dish key or keys used by the claim;
- claim mechanism (`coverage_v2_metrics` recomputation or stored
  `comparison_ready` signal);
- bucket eligibility and the mechanical reason; and
- `SHA-256("DL-001-CAL-2026-07-23" || stable_restaurant_id)` rank.

The recomputation must reproduce the exact production
`coverage_v2_metrics` semantics at the recorded commit. In particular, scope
by `restaurant_entities` coordinates, include every restaurant belonging to a
scoped entity, and aggregate menu/photo/comparison evidence by `entity_id`.
Do not substitute a restaurant-coordinate or `restaurant_id` grouping even
when most entities currently map to one restaurant. Record the exact production
function text or its hash beside the export query.

Keep the registered rank input stable: for an entity-level candidate,
`stable_restaurant_id` means the entity's preserved `legacy_place_id`; when
that is absent, use the lexicographically smallest attached restaurant
`place_id` and record that fallback. When neither exists, retain the entity for
production-metric parity but exclude it from all DL-001 selection buckets.
Never rank a cohort record using an internal entity UUID. Emit only one
candidate row per entity.

Confirm that at least four candidates exist in each bucket:

1. SQL-claimed comparison-ready;
2. menu/photo-rich but not SQL-claimed comparison-ready; and
3. sparse.

Do not substitute `menu_matched_count` for a comparison claim.

## Selected Menu Evidence

For the hash-selected 12 restaurants, export:

- restaurant/entity ID;
- `menu_item_id` and `canonical_dish_id`;
- item name and preserved source aliases;
- source and confidence;
- active state;
- source snapshot and observation time;
- location-specific versus inherited-template status; and
- a sanitized current-menu evidence file or render with SHA-256.

The evidence must meet `BENCHMARK_SPEC.md`: observed within 30 days, or a
verified Management publication within 90 days when no later declared change
exists.

## Selected Photo Evidence

Export no more than 10 photos per restaurant and no more than 120 total:

- stable photo ID and restaurant/entity ID;
- `menu_item_id`, `canonical_dish_id`, and Gemini label;
- source, source platform, legacy attribution, stored author type,
  attribution confidence, and trust label;
- active, moderation, orderable, storefront, and menu-photo state;
- stored `comparison_ready` flag;
- tier, dimensions, and non-personal observation times;
- exact/content/perceptual/duplicate hashes;
- rights or consent status when relevant;
- local evidence-file path and SHA-256;
- sanitized evidence for restaurant/source attachment and author basis; and
- accessibility-at-snapshot and duplicate-group result.

For each selected SQL-claimed restaurant, include every photo attached to its
claimed comparison dish before filling the remaining slots by stable hash.
Stop rather than truncate a claimed dish if the total would exceed 120.

Select the audited claimed dish by a recorded deterministic formula over the
seed, stable entity ID, and dish key. Preserve the chosen dish's complete
eligible photo roster and count so the DataLab can verify that no attached
photo was omitted. Record the exact formula and candidate-roster hash used to
fill all remaining photo slots.

## Reproducibility Record

Include:

- exact read-only query text;
- database/schema/migration version;
- separate candidate results for the recomputed V2 and stored-flag mechanisms;
- export timestamp;
- transaction read-only proof or main-thread attestation;
- candidate, selected restaurant, menu, and photo row counts;
- bucket counts;
- SHA-256 manifest for every file;
- redaction log; and
- an opaque Guardian packet that omits bucket and SQL-claim labels until the
  blind audit is complete.

The redaction log must show the secret-value scan as completed, not
`run_before_completion`, and give a result for every payload file. Because a
redaction log and checksum manifest cannot contain their own final hashes
without self-reference, record the exact completed scan-and-serialization
procedure for those two control files and independently rescan them after
serialization.

Randomize Guardian restaurant order independently of bucket and selection
order, assign opaque IDs only after that shuffle, and keep the seed or mapping
from the Guardian until all blind judgments are frozen. Commit or export a
pre-audit hash commitment to the shuffle seed so the order remains
reproducible after unblinding.

## Resume Gate

The DataLab Lead checks only completeness, bounds, hashes, and safety. The
Benchmark Guardian then performs the blind item, provenance, accessibility,
rights, and duplicate audit. No implementer grades its own result.
