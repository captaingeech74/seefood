# Cycle 2 — Identity Enrichment

## Decision

**Implement with review:** add the deterministic linker and website/status gates
to the Overture shadow pipeline. Propose a complementary-record association only
when normalized domain, phone, or street-address evidence is paired with a
compatible name and a tight location constraint; quarantine ties. Keep new
omissions, duplicate merges, rejected websites, and all status changes under
review until broader labeled precision reaches the publication threshold.

## Question, sample, and incremental gain

Can a small evidence rule recover the 7/15 human-reviewed Cycle 1 OSM matcher
misses without consuming the 4 reviewed high-confidence omissions? The lab
reused the three Cycle 0 boxes (1,371 OSM restaurants, 5,732 Overture
restaurants, and 619 records unresolved by the old name/distance matcher), the
six Cycle 1 boxes (1,238 Overture restaurants), 120 selected Overture website
associations, and 135 cached web responses. No network calls were made.

The new rule recovered **7/7 reviewed false negatives to their reviewed
Overture target, retained 4/4 reviewed omissions, and created 0 false links in
that 11-row fixture**. Across all 619 old unresolved records it emitted 232
link candidates, quarantined 25 ambiguous cases, and left 362 unresolved. Only
the 7 labeled recoveries establish correctness; 232 is a review workload, not
measured lift or precision. This selected fixture and the purposive boxes do not
support a national rate.

## Quality gates and overlap

The smallest useful linker normalizes website hosts, US phone digits, street
numbers/names, names, and coordinates. A domain or phone must have compatible
name evidence; an address must have similarity or a distinctive shared name
token. Evidence normally must be within 50 m (an exact address may extend to
150 m), and competing candidates within one score point are quarantined. This
adds deterministic evidence to—not another roster beside—the Overture seed.

On the selected 120 website associations, the content gate accepted 25,
rejected 15, and quarantined 80. None of the 10 human-reviewed contradictory
associations was accepted. “Rejected” means unsuitable for automatic
association under the gate, not proven false; unreachable pages are
quarantined. HTTP success is never identity or operating proof.

The 17 nearby exact-name duplicate candidate clusters from Cycle 1 split into
16 with a shared normalized phone or domain and 1 still ambiguous. These are
evidence-resolved candidates, not 16 human-confirmed merges, so production
merges remain review-gated.

For operating status, the validator found **0 safe automatic state changes**.
It produced 8 deterministic review triggers; the separate human evidence had 5
status-review cases (4 provider-open contradictions and 1 corroborated
provider-closed record). A reachable page does not reopen or keep open a place.
Only explicit closure language on an accepted identity is eligible for an
automatic-close signal, and this sample produced no such case.

## Errors, practicality, and readiness

The key prevented error was a former-occupant case sharing a phone nearby: name
compatibility and the 50 m constraint retained it as an omission. Remaining
failure modes are chain domains, recycled phones and addresses, co-located
businesses, generic names, stale pages, blocked or script-only pages, and a
selected fixture too small to establish production precision. The conservative
website gate also quarantines many potentially valid sites.

The method is standard-library Python over cached monthly source observations;
its operational cost is local matching and review, with no paid source. It can
run with each Overture monthly refresh and complementary-source snapshot.

- **Technical value: High.** A compact deterministic rule fixes every selected
  known miss while preserving every selected known omission and supplies clear
  quarantine reasons.
- **Production readiness: Review.** The lab-only code and metrics are ready for
  shadow use, but the small selected labels do not justify automatic publishing,
  duplicate merging, or status mutation.
- **Next action:** Cycle 3 should use the enriched identity graph for bounded
  DoorDash yield measurement; do not expand identity-source collection first.

Reproducible sanitized aggregates are in `CYCLE2_METRICS.json`. The 11-row
human-reviewed fixture is salted-hash-only and remains separate from evaluator
logic. Raw provider records and page evidence remain ignored. No production
credentials, writes, paid calls, deploys, or network calls were used.
