-- Durable photo identity and reversible cleanup support.
-- Exact content hashes are automatic identity. Perceptual hashes are audit-only.

create table if not exists photo_dedupe_runs (
  id uuid primary key default gen_random_uuid(),
  scope text not null,
  mode text not null check (mode in ('audit', 'apply', 'rollback')),
  status text not null default 'running',
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  before_metrics jsonb not null default '{}'::jsonb,
  after_metrics jsonb not null default '{}'::jsonb,
  notes jsonb not null default '{}'::jsonb
);

alter table photos add column if not exists duplicate_of_photo_id bigint references photos(id);
alter table photos add column if not exists dedupe_reason text;
alter table photos add column if not exists dedupe_run_id uuid references photo_dedupe_runs(id);
alter table photos add column if not exists deduped_at timestamptz;

create table if not exists photo_origins (
  id bigint generated always as identity primary key,
  photo_id bigint not null references photos(id) on delete cascade,
  restaurant_id text not null references restaurants(place_id) on delete cascade,
  source text not null,
  origin_url text not null,
  storage_url text,
  attribution text,
  photo_author_type text,
  source_snapshot_id uuid references source_snapshots(id),
  content_hash text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (restaurant_id, source, origin_url)
);

create table if not exists photo_menu_item_links (
  photo_id bigint not null references photos(id) on delete cascade,
  menu_item_id bigint not null references menu_items(id) on delete cascade,
  source text not null,
  created_at timestamptz not null default now(),
  primary key (photo_id, menu_item_id)
);

create table if not exists photo_dedupe_actions (
  id bigint generated always as identity primary key,
  run_id uuid not null references photo_dedupe_runs(id) on delete cascade,
  photo_id bigint not null references photos(id) on delete cascade,
  canonical_photo_id bigint references photos(id),
  action text not null,
  reason text not null,
  previous_state jsonb not null,
  created_at timestamptz not null default now(),
  unique (run_id, photo_id)
);

insert into photo_origins (
  photo_id,
  restaurant_id,
  source,
  origin_url,
  storage_url,
  attribution,
  photo_author_type,
  source_snapshot_id,
  content_hash,
  first_seen_at,
  last_seen_at
)
select
  id,
  restaurant_id,
  source,
  origin_url,
  storage_url,
  attribution,
  photo_author_type,
  source_snapshot_id,
  content_hash,
  coalesce(first_seen_at, created_at),
  coalesce(last_seen_at, created_at)
from photos
where origin_url is not null
on conflict (restaurant_id, source, origin_url) do update set
  last_seen_at = greatest(photo_origins.last_seen_at, excluded.last_seen_at),
  storage_url = coalesce(excluded.storage_url, photo_origins.storage_url),
  content_hash = coalesce(excluded.content_hash, photo_origins.content_hash);

insert into photo_menu_item_links (photo_id, menu_item_id, source)
select id, menu_item_id, source
from photos
where menu_item_id is not null
on conflict (photo_id, menu_item_id) do nothing;

create index if not exists idx_photo_origins_photo on photo_origins(photo_id);
create index if not exists idx_photo_origins_restaurant_source on photo_origins(restaurant_id, source);
create index if not exists idx_photo_menu_links_item on photo_menu_item_links(menu_item_id);
create index if not exists idx_photos_content_hash on photos(restaurant_id, content_hash) where content_hash is not null;
create index if not exists idx_photos_perceptual_hash on photos(restaurant_id, perceptual_hash) where perceptual_hash is not null;
create index if not exists idx_photos_duplicate_of on photos(duplicate_of_photo_id) where duplicate_of_photo_id is not null;
