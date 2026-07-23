# Infrastructure Options, July 2026

## Current Decision

Keep one Supabase Postgres database for normalized operational data and R2 for
image bytes and large immutable artifacts. Do not split one logical corpus
across free accounts. The current stack is simple, inexpensive at proof-market
scale, and preserves a clean migration path. Do not migrate providers now.

This is intentionally a judgment call, not a list for the product owner to
continually arbitrate. Most alternatives below are a watchlist for later.
Waiting does not create meaningful lock-in: the database is standard Postgres,
R2 uses the standard S3 object API, and acquisition workers are separated from
the product. Changing early would add operational work before it solves a
measured problem.

## Image Delivery

Today the app uses a stable route that returns a signed R2 redirect. Vercel
handles a tiny redirect response, never the image payload. The next external
configuration step is connecting an assets subdomain to the R2 bucket and
setting `R2_PUBLIC_BASE_URL`; Cloudflare then provides direct URLs and cache.
Do this once the production asset hostname is chosen. It is the one current
infrastructure improvement with a useful payoff and very little added
complexity.

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

Use these triggers:

- Database: reconsider Supabase only when its monthly cost becomes material,
  database latency hurts the app, or the geographic corpus approaches its
  practical plan limit.
- Search: add Typesense or Meilisearch only when diners cannot reliably find
  dishes with Postgres search or search latency becomes visibly slow.
- Analytics: add ClickHouse only when event reporting slows the product
  database or reaches millions of events per month.
- Object storage: keep R2 while image delivery is the main workload. Reprice
  alternatives only if storage cost, rather than delivery, becomes dominant.
- Processing: add inexpensive worker machines when the acquisition queue is
  waiting on compute for days, not merely because another host is cheaper on
  paper.

Until a trigger fires, measure at each rollout gate and keep building coverage.
