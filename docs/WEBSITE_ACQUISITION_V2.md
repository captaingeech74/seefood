# Website Acquisition V2

Updated August 3, 2026.

This is the isolated, free website-acquisition lane. It does not write to
`restaurants`, `menu_items`, or `photos`, and it has no paid fallback. Existing
production data remains the fallback until evidence is explicitly promoted by
a separate reviewed operation.

## Stack

- Crawlee owns bounded concurrency, timeouts, and resumable request queues.
- Plain HTTP is first. Public JavaScript pages then escalate through Patchright,
  Scrapling, and Crawl4AI.
- The collector reads schema.org, visible menu cards, embedded platform data,
  and bounded first-party JSON responses.
- PDF menus use embedded-text extraction first. Weak-layout or image-only PDFs
  fall back to PaddleOCR-VL 1.6 through a local MLX-VLM server on Apple Silicon.
- Every run, restaurant result, menu observation, PDF, image candidate, source
  URL, content hash, extraction method, and failure is stored only in the
  `website_*_v2_*` evidence tables.

## Local operation

The browser environment self-installs through the existing crawler setup. The
OCR environment is deliberately separate because its local models are large:

```bash
python3.12 -m venv crawler/.venv_paddleocr
crawler/.venv_paddleocr/bin/python -m pip install -r crawler/paddleocr-requirements.txt
npm run acquisition:ocr-mlx
npm run acquisition:ocr-server
npm run acquisition:websites-v2 -- --market temecula-ca --limit 5000 --concurrency 12
```

The two OCR services run in separate terminals. A crawl can run without them;
weak visual PDFs then remain recorded without invented menu items. Resume an
interrupted run with `--run-id <uuid>`. Result writes are idempotent, and every
execution uses a fresh Crawlee queue so old handled-request state cannot leak
into a resumed run.

## Temecula proof

Completed run: `1a879c58-b434-47ab-be59-a1b4544e6b60`.

- 438 market entities; 366 had a website and all 366 were attempted.
- 59 restaurants produced menus; 291 were reachable but yielded no menu; 16
  blocked every free method.
- 5,318 staged item observations, representing 5,116 unique normalized items
  within their restaurants. 4,033 were not already in the current corpus.
- 14,220 unique restaurant/image pairs (11,901 globally unique URLs) were
  staged as candidates. 580 restaurant/image pairs were directly tied to menu
  items (519 globally unique URLs).
- 69 PDFs were discovered. 51 were downloaded and parsed; 21 yielded menu
  items. Embedded PDF text yielded 387 raw items and PaddleOCR-VL yielded 163,
  for 550 total PDF item observations before restaurant-level deduplication.
- A random reachability check found 75/75 dish-linked URLs reachable and 74/75
  served with an image MIME type; the remaining `.jpg` served as generic binary.
  Generic candidates were weaker: 66/75 reachable and 65/75 image MIME. They
  remain candidates and must be byte-verified/classified before promotion.

The run changes no user-visible coverage by itself. If the staged evidence
passes the existing food, item-linkage, duplicate, provenance, and publication
gates, it could add complete menus for 43 restaurants that currently have no
corpus menu and could raise Temecula menu coverage from 52 to as many as 95 of
438 entities. That is potential, not a published claim.

LRay's Kitchen remains protected as `test_fixture`; the V2 lane made no write
to its 36 menu items or 47 photos.
