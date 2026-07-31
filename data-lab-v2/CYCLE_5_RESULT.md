# Cycle 5 — Grubhub National Technical Yield

## Decision

**Negotiate, then stop live collector expansion.** Grubhub's public SPA is
technically runnable: all 12 rendered searches completed and exposed restaurant
results. It produced no strict target/location match in this sample, however,
so there were no safe store fetches, menus, items, or photos. Do not scale or
productionize browser search. The separate July two-restaurant pilot still
shows high conditional menu/photo density when a correct store is known, which
justifies asking Grubhub for sanctioned discovery and content access—not a
claim of national reach.

Ask Grubhub for a bounded US location roster and daily menu feed/API with
stable restaurant/location, menu, category and item IDs; names, full addresses,
coordinates, operating/availability status, descriptions, prices, image URLs
or bytes, and update/delete timestamps and deltas. Required rights are
production ingestion, derived identity links, photo storage and delivery,
provenance display, and documented retention/deletion behavior. Require a
six-market evaluation sample before any commercial commitment.

## Fresh sample and collection

The deterministic purposive sample selected two Cycle 4 identities in each of
the six Cycle 1 markets: Albuquerque, Boone, Jackson, Portland, Spokane, and
Wichita. It contains exactly 6 chain and 6 independent records, 6 DoorDash-
sitemap-matched and 6 unmatched records, and 6 accepted and 6 quarantined
website associations. Five had a Cycle 4 website menu surface and seven did
not. This is deliberately balanced technical coverage, not a probability
sample; no result is a national rate.

The lab used the already-installed crawler Python environment read-only and ran
the worktree's unchanged `crawler/fetch.py`. It performed 12 sequential public
rendered searches, one per target, and no store operations because none passed
the identity gate. Every search returned HTTP 200 in 5.712–6.589 seconds and
showed 1–36 restaurant candidates. Total browser time was 75.506 seconds. There
were 12 browser operations against a cap of 24, no retry, no credential, no
CAPTCHA or block, and no access-control evasion.

The identity gate required compatible distinctive name evidence, target city,
and target street-number evidence in one unique store URL. All 12 searches were
rejected or quarantined. Eleven lacked a target-compatible location; the one
strong same-name alternative was at the wrong street address and was also
rejected. A separate 12-row hash-only review fixture judged all rejections
appropriate. Alternatives and ambiguous locations received no store request.

## Yield, overlap, and failures

Fresh search-page execution was 12/12, but safe target discovery was **0/12**.
Therefore store fetches, menus, item observations, unique items, items with
photos, unique photo URLs, menu-photo links, bounded photo downloads, unique
content hashes, and duplicate inflation were all **0**. Both the six DoorDash-
matched and six unmatched strata yielded zero Grubhub menus. Both the five
website-menu and seven website-no-menu strata also yielded zero. No refresh
overlap was measured because each target was observed once.

The main observed failure was discovery relevance: the SPA returned populated
nearby result sets without the exact target/location. This differs from Cycle
3's uniform cloud block, but it is equally unsuitable for unattended national
acquisition. Other known failures are same-name multi-location ambiguity,
provider-shortened names, dynamic UI/network shapes, and cuisine alternatives.

## Separate prior July evidence

The read-only July handoff and decision log report 270 pre-fix Grubhub attempts
with zero items. After the location and current-response fix, two accepted
Temecula pilots produced **325 active items and 149 byte-unique photos**. A
permissive match also attached an alternative restaurant's 172 items and 46
photos to the wrong identity; the pilot deactivated them before release. Those
are prior two-restaurant and negative-control results, not part of this fresh
sample and not a national yield estimate.

- **Technical value: Medium, conditional.** Proven high density for two known
  stores, but zero safe discovery in the fresh six-market sample.
- **Production readiness: Negotiate.** Public browser search is too sparse and
  identity-sensitive; access, reliability, content rights, cost, and deletion
  semantics are unresolved.
- **Refresh/cost:** a sanctioned daily delta feed is the target. The browser
  prototype is single-process and low-bandwidth but has poor useful yield, so
  its operational complexity is not justified.

Reproduction is in `cycle5_grubhub.py`; sanitized aggregates are in
`CYCLE5_METRICS.json`; review labels are separate in
`cycle5_review_fixture.json`. Raw pages, response payloads, URLs, and any image
bytes remain ignored. No production files, credentials, writes, paid calls,
deploys, or main-crawl control were used.
