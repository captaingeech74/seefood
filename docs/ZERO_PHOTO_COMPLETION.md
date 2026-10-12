# Zero-photo completion lane

Updated September 28, 2026.

This is a conservative coverage-first publisher for live restaurants that have
no useful photo. It does not crawl the web again. It reviews the already-staged,
byte-verified official-website evidence and publishes a small first visual set
only when all of these agree:

1. the website URL contains a distinctive restaurant identity;
2. the downloaded bytes still match the recorded fingerprint;
3. the image has usable dimensions and is not a known quarantined asset;
4. free on-device Apple Vision finds strong food evidence and no meaningful
   explicit, people, interior, document, text-ad, product-bottle, or other
   non-food signal;
5. venue shells, promotional captions, drinks, cartoons, weak page context,
   and every uncertain result remain unpublished.

Direct current-menu matches rank first. A clearly useful restaurant-owned food
photo may still publish honestly without a dish name. The lane creates no menu
claim in that case and permits at most one unmatched photo per restaurant. It
never uses a paid API and fails closed if the local classifier is unavailable.

## September 28 production run

Run `e88d08c2-4bfa-48c6-918e-c79ee3c64adc` evaluated 3,952 candidates. It
withheld 3,861 and published 91 photos across 89 previously empty restaurants:
3 direct menu links and 88 honest restaurant-level food photos. Every selected
image was also reviewed in a generated contact sheet before publication.

Live coverage changed from 698 to 787 entities with useful photos (+89), while
empty live entities changed from 1,604 to 1,515. Useful photos changed from
31,845 to 31,936 (+91). No existing photo or menu row was removed. Market
memberships among the improved restaurants include Spokane 33, Carlsbad 29,
Temecula 19, and San Diego metro 16; those market counts overlap.

The three initially reported persistence failures were audit-query false
negatives on legacy rows whose origin URL matched but whose content hash had
not been backfilled. The photos were active and useful. The audit query now
checks origin URL as well; the logged run correctly records 91 published and
zero failed.

## Operations

Preview (default):

```bash
npm run acquisition:complete-zero-photo -- --candidate-limit=12000
```

Publish only after reviewing `logs/zero-photo-completion/<run>/manifest.json`
and the generated selected-image contact sheets:

```bash
npm run acquisition:complete-zero-photo -- --candidate-limit=12000 --publish
```

Rollback the run without deleting provenance:

```bash
npm run acquisition:complete-zero-photo -- --rollback-run=e88d08c2-4bfa-48c6-918e-c79ee3c64adc
```

The production run and every action are recorded in
`zero_photo_completion_runs` and `zero_photo_completion_actions`. Code rollback
tag: `rollback/pre-zero-photo-completion-20260928`.
