# Cycle 1 — National Reality Check

## Decision

**Implement with review:** keep Overture Places as the monthly identity-graph
seed, but quarantine new records and route website conflicts, status changes,
nearby exact-name duplicate candidates, and OSM omission candidates through
review. This evidence does not support automatic production publishing.

## Question and real sample

Does the Cycle 0 anchor remain useful across varied US markets, and what must be
checked before production use? The purposive sample used six 0.05° × 0.05° boxes:
Portland, ME; Boone, NC; Jackson, MS; Wichita, KS; Albuquerque, NM; and Spokane,
WA. Overture release `2026-07-22.0` returned 22,611 places, including 1,238
restaurants (113–310 per box). These boxes span regions and community sizes and
contain both chains and independents, but were not randomly selected or labeled
for subgroup estimation. **No count or percentage below is a national rate.**

All 1,238 restaurants had an address; 1,180 had a phone, 1,088 a website, and
948 an operating status. The website audit deliberately selected 20 records per
market (120 total), prioritizing the rare provider-closed records, then unknown
status, then open records. It is not a representative website sample.

## Separate audit results

- **Identity accuracy:** public evidence was decisive for 54/120 selected
  records: 44 identities were corroborated and 10 contradicted. The remaining
  66 were not decisive, so 44/54 must not be treated as anchor precision.
- **Website reachability:** 69/120 selected URLs returned HTTP success; 51 were
  blocked, unreachable, or errored. HTTP success alone was not identity or
  operating-status evidence.
- **Website accuracy:** among the 69 reachable URLs, 42 local sites and 2
  third-party pages corroborated identity, 10 contradicted it, and 15 were
  inconclusive.
- **Operating status:** the selected set contained 82 provider-open, 37 unknown,
  and 1 permanently closed record. Public evidence contradicted 4/82 selected
  open statuses and corroborated the one selected closed status; the rest were
  not comprehensively verified.
- **Duplicate candidates:** an intentionally conservative signal found 17
  excess records in 17 exact-normalized-name clusters connected within 30 m.
  These are candidates, not confirmed duplicates or identity errors.
- **OSM omission candidates:** a separate website-bearing sample of 15 unresolved
  Cycle 0 OSM records produced 4 high-confidence Overture omissions, 7 matcher
  false negatives, and 4 inconclusive or stale candidates. This selected 15-row
  result is incremental review yield, not an Overture recall estimate.

## Practicality, overlap, and failures

The six Overture downloads totaled about 41 MB and preserve the monthly refresh
model chosen in Cycle 0. The 135 cached web checks used six bounded workers, a
20-second request timeout, and no bypass attempts; the maximum observed elapsed
time was 30.01 seconds. A new six-market OSM comparison could not be completed:
the primary bounded request returned 504 and one alternate timed out at 90
seconds, so collection stopped. OSM overlap and omission evidence therefore
remains the separate, selected Cycle 0 candidate audit rather than a new-market
comparison. Production OSM ingestion would still require owned or contracted
extract/diff infrastructure.

Observed failure modes were wrong or stale website associations, dead and
blocked URLs, pages too ambiguous to verify, open-status contradictions, nearby
same-name records, and matcher misses. The sample also cannot quantify national
recall, precision, chains versus independents, or website/status freshness.

## Scores and next action

- **Technical value: High.** Overture remains a broad, field-rich seed; the
  audit identifies concrete validation and review gates.
- **Production readiness: Review.** The shadow loader is usable, but automatic
  publication is not justified by this selected evidence.
- **Next action:** in Cycle 2, implement and measure website/status validation
  plus improved identity matching against the seven selected matcher misses.
  Keep OSM additions review-only. No commercial-source negotiation is justified
  by Cycle 1.

Reproducible aggregates are in `CYCLE1_METRICS.json`; the review fixture contains
only salted cache-key hashes. Raw provider records and page evidence remain in
ignored directories. No production credentials, writes, paid calls, deploys,
or network calls during consolidation were used.
