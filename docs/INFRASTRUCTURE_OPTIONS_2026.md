# Infrastructure Options, July 2026

## Current Decision

Keep one Supabase Postgres database for normalized operational data and R2 for
image bytes and large immutable artifacts. Do not split one logical corpus
across free accounts. The current stack is simple, inexpensive at proof-market
scale, and preserves a clean migration path.

## Image Delivery

Today the app uses a stable route that returns a signed R2 redirect. Vercel
handles a tiny redirect response, never the image payload. The next external
configuration step is connecting an assets subdomain to the R2 bucket and
setting `R2_PUBLIC_BASE_URL`; Cloudflare then provides direct URLs and cache.

## Alternatives Worth Repricing Later

- Database: Neon Postgres for scale-to-zero/serverless branching; a managed or
  self-hosted Postgres provider on Hetzner/OVH for lower steady-state compute.
- Search: Postgres full-text and trigram search first; Typesense or Meilisearch
  on a small VM when typo-tolerant menu search needs a dedicated index.
- Analytics: ClickHouse when event volume outgrows transactional Postgres.
- Object storage: Backblaze B2 and Wasabi can undercut storage price in some
  shapes, but R2's zero-egress model is unusually strong for a photo browser.
- Processing: cheap regional VMs or existing local workers for batch crawling
  and image work; queues should remain durable and provider-independent.

## Revisit Triggers

Reprice the stack after Temecula, San Diego metro, and San Diego County. At each
gate record database GB, R2 GB, monthly image requests, image cache hit rate,
worker hours, acquisition cost per restaurant, and p95 API latency. Change a
provider only when a measured constraint is material.

