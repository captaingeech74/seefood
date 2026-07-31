# Cycle 3 — DoorDash National Technical Yield

## Decision

**Negotiate.** Public state store sitemaps are technically useful national
discovery input: keep them as a review-gated provider-identity signal in the
shadow graph. Do not treat direct cloud store-page fetching as a scalable path.
Existing July crawler evidence proves substantial menu/photo value, but fresh
lab requests were uniformly blocked and production rights are not established.

Ask DoorDash for a sanctioned US store/menu feed or API containing stable store
IDs, name, address/coordinates, status, menu/category/item IDs, names,
descriptions, image URLs or bytes, update/delete timestamps, and deltas at least
daily. The agreement must permit production ingestion, derived identity links,
photo storage/delivery, and provenance display. The measured discovery reach
and prior byte-verified photo yield justify the request.

## Real sample and discovery denominator

The fixed sample reused the six Cycle 1 Overture `2026-07-22.0` boxes: Portland
ME, Boone NC, Jackson MS, Wichita KS, Albuquerque NM, and Spokane WA. It spans
six states/regions and contains chains and independents, but is purposive—not a
national probability sample.

Six public state sitemaps (10.7 MB, 61,826 store URLs) were downloaded once,
below the ten-download limit. Among **1,238 eligible Overture restaurants**, the
conservative name+locality rule produced **328 unique matches (26.5%)**, **91
ambiguous candidates (7.4%)**, and **819 rejected/no-safe-match records
(66.2%)**. By stratum, it matched 110/307 brand-bearing chain records and
218/931 independents. These are matcher dispositions, not proven DoorDash
coverage or national rates.

A separate deterministic selected review covered six matches, six ambiguities,
and eight rejections. It corroborated all six selected final matches, judged all
six ambiguity quarantines appropriate, caught three earlier weak-overlap false
matches that the final rule now rejects, and left five rejections unadjudicated.
The review changed the rule before final measurement; its small selected
denominator is not a precision estimate.

## Store, menu, and photo yield

The final store subset selected one chain and one independent in every region:
12 safe unique matches. All **12/12** ordinary requests returned explicit
Cloudflare blocks; therefore successful fetches, menus, items, items with
photos, unique photo URLs/content, and menu-photo links were all **0** in this
fresh sample. No blocked target was retried and no access control was evaded.
Three unique targets attempted before review were later rejected by the tighter
matcher, making **15 total unique page attempts**, all explicit blocks and still
below the 48-attempt cap. Store requests totaled 1.642 seconds; each request and
sitemap operation used a 30-second timeout.

Zero fresh page yield does not erase discovery yield or the separate read-only
July evidence. Existing records report 353/737 historical DoorDash attempts
with items, 37,080 items, and 26,345 photo candidates. A bounded accepted
two-restaurant pilot produced 314 items and 148 new byte-unique photos. The
current documented corpus has 7,422 active DoorDash items across 69 restaurants
and 4,719 source-provenanced unique active photos across 66. Those are prior
Temecula/corpus denominators, not results of this national sample; they do not
provide a duplicate-inflation or national linkage rate.

## Errors, overlap, cost, and readiness

Observed identity errors were weak one-word brand overlap and same-city
multi-location ambiguity. The final rule requires stronger distinctive-name
coverage and quarantines equal-best candidates. Access failure was uniformly an
explicit block. Raw sitemap/page artifacts remain ignored; committed metrics
and review rows contain salted hashes only. Cache reuse replaced the first-pass
aggregate sitemap timing, so no exact sitemap runtime is claimed beyond the
30-second per-operation cap. No repeated live snapshot exists, so refresh
overlap was not measured and no refresh claim is made.

- **Technical value: High.** Sitemaps add broad, cheap provider discovery, and
  prior dedicated-crawler evidence shows strong item/photo value when pages are
  reachable.
- **Production readiness: Negotiate.** Identity stays review-gated; cloud page
  fetching is operationally blocked; content rights and sanctioned access need
  an agreement. Technical usefulness is independent of that terms decision.

Reproduction is in `cycle3_doordash.py`; aggregates and the sanitized attempt
fixture are in `CYCLE3_METRICS.json`, with review labels in
`cycle3_review_fixture.json`. No credentials, paid calls, production reads or
writes, deploys, retries around blocks, or app/production-file edits were used.
