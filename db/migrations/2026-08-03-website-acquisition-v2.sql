-- Isolated website-acquisition V2 evidence. This lane never writes directly
-- into customer-visible menus or photos; promotion remains an explicit,
-- separately reviewed operation.

create table if not exists website_crawl_v2_runs (
  id uuid primary key default gen_random_uuid(),
  market_key text not null references acquisition_markets(market_key),
  status text not null default 'running'
    check (status in ('running','completed','failed','cancelled')),
  collector_version text not null,
  configuration jsonb not null default '{}'::jsonb,
  website_count int not null default 0,
  completed_count int not null default 0,
  failed_count int not null default 0,
  blocked_count int not null default 0,
  restaurant_count int not null default 0,
  restaurant_with_menu_count int not null default 0,
  item_count int not null default 0,
  photo_candidate_count int not null default 0,
  menu_linked_photo_count int not null default 0,
  pdf_found_count int not null default 0,
  pdf_processed_count int not null default 0,
  pdf_item_count int not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists idx_website_crawl_v2_runs_market
  on website_crawl_v2_runs(market_key, started_at desc);

create table if not exists website_crawl_v2_results (
  id bigint generated always as identity primary key,
  run_id uuid not null references website_crawl_v2_runs(id) on delete cascade,
  entity_id uuid not null references restaurant_entities(id) on delete cascade,
  website_id uuid not null references restaurant_websites(id) on delete cascade,
  website_url text not null,
  status text not null check (status in ('completed','empty','blocked','failed')),
  fetch_methods text[] not null default '{}',
  platforms text[] not null default '{}',
  pages_visited int not null default 0,
  item_count int not null default 0,
  photo_candidate_count int not null default 0,
  menu_linked_photo_count int not null default 0,
  pdf_found_count int not null default 0,
  pdf_processed_count int not null default 0,
  pdf_item_count int not null default 0,
  elapsed_ms int not null default 0,
  response_evidence jsonb not null default '{}'::jsonb,
  error_detail text,
  created_at timestamptz not null default now(),
  unique(run_id, website_id)
);

create index if not exists idx_website_crawl_v2_results_run
  on website_crawl_v2_results(run_id, status, entity_id);

create table if not exists website_menu_v2_observations (
  id bigint generated always as identity primary key,
  run_id uuid not null references website_crawl_v2_runs(id) on delete cascade,
  entity_id uuid not null references restaurant_entities(id) on delete cascade,
  website_id uuid not null references restaurant_websites(id) on delete cascade,
  evidence_url text not null,
  extraction_method text not null,
  source_key text not null,
  item_name text not null,
  item_description text,
  image_url text,
  price numeric,
  confidence numeric not null default 0.8,
  item_fingerprint text not null,
  created_at timestamptz not null default now(),
  unique(run_id, entity_id, source_key, item_fingerprint)
);

create index if not exists idx_website_menu_v2_observations_run
  on website_menu_v2_observations(run_id, entity_id, extraction_method);

create table if not exists website_asset_v2_observations (
  id bigint generated always as identity primary key,
  run_id uuid not null references website_crawl_v2_runs(id) on delete cascade,
  entity_id uuid not null references restaurant_entities(id) on delete cascade,
  website_id uuid not null references restaurant_websites(id) on delete cascade,
  page_url text,
  asset_url text not null,
  kind text not null check (kind in ('image','pdf')),
  fetch_status text not null default 'discovered'
    check (fetch_status in ('discovered','processed','failed','too_large','unsupported')),
  content_sha256 text,
  content_type text,
  byte_count int,
  page_count int,
  extraction_method text,
  extracted_item_count int not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(run_id, entity_id, asset_url)
);

create index if not exists idx_website_asset_v2_observations_run
  on website_asset_v2_observations(run_id, kind, fetch_status);

-- Safe when upgrading a database on which an earlier draft of this isolated
-- migration was already exercised.
alter table website_crawl_v2_runs add column if not exists menu_linked_photo_count int not null default 0;
alter table website_crawl_v2_results add column if not exists menu_linked_photo_count int not null default 0;

revoke all on website_crawl_v2_runs from anon, authenticated;
revoke all on website_crawl_v2_results from anon, authenticated;
revoke all on website_menu_v2_observations from anon, authenticated;
revoke all on website_asset_v2_observations from anon, authenticated;
