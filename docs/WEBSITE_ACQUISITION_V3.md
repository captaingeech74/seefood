# Website Acquisition V3

Updated August 3, 2026.

V3 is the durable website-acquisition path. It preserves useful evidence from
the original collector and V2 while fixing the operational gaps found in the
Temecula benchmark: expensive fallbacks ran too eagerly, generic page images
competed with dish-linked assets, PDF quality was uneven, and staged evidence
was not unified into one reviewable corpus.

## Architecture

- Direct HTTP is always attempted first. A blocked or JavaScript-dependent page
  escalates through curl-cffi, Patchright network capture, then Scrapling.
- Crawl4AI remains available only for explicit deep discovery; it is not part of
  the normal fallback chain because it added cost without enough incremental
  evidence in the full-market run.
- Crawlee provides durable leases, retries, bounded concurrency, and per-domain
  serialization. Every active website row is eligible; the worker does not
  silently discard secondary official URLs attached to an entity.
- Structured data, visible menu shapes, and public first-party JSON are stored
  with exact extraction method, content fingerprint, source URL, and run ID.
- Dish-linked images and PDFs enter a durable asset queue. Generic page imagery
  is retained as low-priority evidence but does not consume immediate download
  and verification work.
- One failed observation never retires known-good evidence. Staleness requires
  two successful crawls that both establish absence.
- V2 evidence is merged idempotently into the same durable observation layer.
  Publication is a separate, explicit, scoped operation and never happens as a
  side effect of crawling.

## PDF and OCR routing

Embedded PDF text is parsed first. Weak or image-only documents route through a
provider interface configured by `SEEFOOD_OCR_PROVIDERS`:

- `paddleocr_vl` is the default local path and is immediately runnable on the
  current Apple Silicon environment.
- `unlimited_ocr` supports Baidu Unlimited-OCR through a separately hosted GPU
  endpoint configured with `SEEFOOD_UNLIMITED_OCR_URL`. The model is promising
  for long menus and multi-page documents but is too new, and too dependent on
  NVIDIA-oriented serving, to become the unmeasured default.
- `mistral_ocr` supports Mistral OCR 4 through its API. It is disabled unless
  `MISTRAL_API_KEY` is deliberately supplied, so normal collection makes no paid
  calls.
- `generic_local` permits a compatible internal OCR service.

Provider attempts and failures are recorded. No vendor benchmark is treated as
a SeeFood result; the three engines should be compared on the same representative
menu-PDF set before changing the default.

## Operations

```bash
npm run acquisition:websites-v3 -- --market temecula-ca --limit 5000 --concurrency 12
npm run acquisition:merge-website-evidence -- --market temecula-ca --v2-run-id <uuid>
npx tsx scripts/promote-website-observations.ts --market temecula-ca
npx tsx scripts/promote-website-observations.ts --market temecula-ca --publish
```

The promotion command previews by default. `--publish` is required for writes.
It rejects test fixtures and weak observations, deduplicates normalized dish
names, byte-verifies every proposed image, and records publication snapshots.

## Temecula result

Full V3 run: `8814c13b-0287-4807-887a-506d4a5813fd`.

- 504 website records attempted; 58 yielded data, 415 completed without menu
  evidence, 31 were blocked, and none failed terminally.
- 6,577 raw item observations, 1,357 dish-linked image URLs, 95 PDFs, and 1,156
  PDF-derived items were recorded.
- 1,425 immediate assets completed and produced 680 exact unique linked image
  byte identities. Another 18,998 generic image candidates were staged without
  consuming immediate verification capacity.
- V3 alone found 5,017 unique entity/dish pairs across 56 entities. V2 alone
  found 5,115 across 59. Their unified evidence contains 5,560 across 66, proving
  that V3 is a better operating architecture but not a strict content superset.
- The reviewed production publication added 542 new canonical dishes across
  nine existing restaurant pages and 249 photo records representing 248 new
  exact image byte identities. All 316 promoted image candidates passed byte
  verification. It deepened existing menus; it did not give a restaurant its
  first menu.

Rollback point: `rollback/pre-website-v3-20260803`.

LRay's Kitchen remains a protected `test_fixture` and was excluded from
publication.
