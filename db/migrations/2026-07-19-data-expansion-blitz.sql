alter table restaurant_entities add column if not exists categories text[] not null default '{}';
alter table restaurant_entities add column if not exists phone text;
alter table restaurant_entities add column if not exists email text;
alter table restaurant_entities add column if not exists socials text[] not null default '{}';
alter table restaurant_entities add column if not exists operating_status text;
alter table restaurant_entities add column if not exists overture_confidence numeric;
alter table restaurants add column if not exists doordash_store_url text;
create index if not exists idx_restaurant_entities_geo on restaurant_entities(lat, lng);
create index if not exists idx_restaurant_entities_categories on restaurant_entities using gin(categories);

create table if not exists restaurant_websites (
  id uuid primary key default gen_random_uuid(),
  entity_id uuid not null references restaurant_entities(id) on delete cascade,
  url text not null,
  domain text not null,
  source text not null,
  platforms text[] not null default '{}',
  active boolean not null default true,
  last_http_status int,
  last_live_crawl_at timestamptz,
  last_archive_crawl_at timestamptz,
  page_count int not null default 0,
  menu_item_count int not null default 0,
  photo_count int not null default 0,
  pdf_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(entity_id, url)
);
create index if not exists idx_restaurant_websites_domain on restaurant_websites(domain);
create index if not exists idx_restaurant_websites_entity on restaurant_websites(entity_id);

create table if not exists website_assets (
  id bigint generated always as identity primary key,
  entity_id uuid not null references restaurant_entities(id) on delete cascade,
  website_id uuid references restaurant_websites(id) on delete cascade,
  page_url text,
  asset_url text not null,
  kind text not null check (kind in ('image', 'pdf')),
  source text not null,
  metadata jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique(entity_id, asset_url)
);
create index if not exists idx_website_assets_entity_kind on website_assets(entity_id, kind, active);

create table if not exists web_crawl_jobs (
  id uuid primary key default gen_random_uuid(),
  entity_id uuid not null references restaurant_entities(id) on delete cascade,
  website_id uuid not null references restaurant_websites(id) on delete cascade,
  source text not null check (source in ('live', 'common_crawl')),
  status text not null default 'queued',
  priority int not null default 100,
  attempts int not null default 0,
  leased_at timestamptz,
  completed_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(website_id, source)
);
create index if not exists idx_web_crawl_jobs_queue on web_crawl_jobs(status, priority, created_at);

create table if not exists merchant_connections (
  id uuid primary key default gen_random_uuid(),
  entity_id uuid not null references restaurant_entities(id) on delete cascade,
  provider text not null check (provider in ('google_business', 'square', 'toast', 'clover')),
  status text not null default 'pending_credentials',
  external_account_id text,
  external_location_id text,
  encrypted_access_token text,
  encrypted_refresh_token text,
  token_expires_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(entity_id, provider)
);

create table if not exists merchant_import_runs (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references merchant_connections(id) on delete cascade,
  status text not null default 'running',
  item_count int not null default 0,
  photo_count int not null default 0,
  error text,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

insert into source_registry (source, enabled, mode, priority, paused_reason) values
  ('overture', true, 'discovery', 8, null),
  ('common_crawl', true, 'automatic', 12, null),
  ('bentobox', true, 'automatic', 20, null),
  ('owner', true, 'automatic', 20, null),
  ('spothopper', true, 'automatic', 20, null),
  ('slice', true, 'automatic', 20, null),
  ('flipdish', true, 'automatic', 20, null),
  ('lightspeed', true, 'automatic', 20, null),
  ('gloriafood', true, 'automatic', 20, null)
on conflict (source) do update set
  enabled = excluded.enabled,
  mode = excluded.mode,
  priority = excluded.priority,
  paused_reason = excluded.paused_reason,
  updated_at = now();
