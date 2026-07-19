create extension if not exists pgcrypto;

-- SeeFood owns this entity ID. Provider identities (Google, OSM, future
-- licensed feeds) attach to it without becoming the primary key of the corpus.
create table if not exists restaurant_entities (
  id uuid primary key default gen_random_uuid(),
  legacy_place_id text unique,
  name text not null,
  normalized_name text not null,
  address text,
  lat double precision,
  lng double precision,
  website text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists restaurant_identities (
  id bigint generated always as identity primary key,
  entity_id uuid not null references restaurant_entities(id) on delete cascade,
  provider text not null,
  provider_id text not null,
  provider_url text,
  name text,
  address text,
  lat double precision,
  lng double precision,
  website text,
  confidence numeric not null default 1,
  raw_metadata jsonb not null default '{}'::jsonb,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  active boolean not null default true,
  unique(provider, provider_id)
);

alter table restaurants add column if not exists entity_id uuid references restaurant_entities(id);
create unique index if not exists uq_restaurants_entity on restaurants(entity_id) where entity_id is not null;
create index if not exists idx_restaurant_identities_entity on restaurant_identities(entity_id);
create index if not exists idx_restaurant_identities_provider on restaurant_identities(provider, active);

insert into restaurant_entities (legacy_place_id, name, normalized_name, address, lat, lng, website, status, created_at, updated_at)
select
  place_id,
  name,
  trim(regexp_replace(lower(name), '[^a-z0-9]+', ' ', 'g')),
  address,
  lat,
  lng,
  website,
  case when status = 'test_fixture' then 'test_fixture' else 'active' end,
  created_at,
  updated_at
from restaurants
on conflict (legacy_place_id) do update set
  name = excluded.name,
  normalized_name = excluded.normalized_name,
  address = coalesce(excluded.address, restaurant_entities.address),
  lat = coalesce(excluded.lat, restaurant_entities.lat),
  lng = coalesce(excluded.lng, restaurant_entities.lng),
  updated_at = greatest(restaurant_entities.updated_at, excluded.updated_at);

update restaurants r
set entity_id = e.id
from restaurant_entities e
where e.legacy_place_id = r.place_id and r.entity_id is null;

insert into restaurant_identities (entity_id, provider, provider_id, name, address, lat, lng, website, confidence)
select entity_id, 'google', place_id, name, address, lat, lng, website, 1
from restaurants
where entity_id is not null
on conflict (provider, provider_id) do update set
  entity_id = excluded.entity_id,
  name = excluded.name,
  address = excluded.address,
  lat = excluded.lat,
  lng = excluded.lng,
  website = excluded.website,
  last_seen_at = now(),
  active = true;

-- Source adapters are operationally controlled in data, not by deleting code.
create table if not exists source_registry (
  source text primary key,
  enabled boolean not null default true,
  mode text not null default 'automatic',
  priority int not null default 100,
  paused_reason text,
  updated_at timestamptz not null default now()
);

insert into source_registry (source, enabled, mode, priority, paused_reason) values
  ('google', true, 'automatic', 20, null),
  ('openstreetmap', true, 'discovery', 10, null),
  ('website', true, 'automatic', 15, null),
  ('schema_org', true, 'automatic', 15, null),
  ('menufy', true, 'automatic', 25, null),
  ('toast', true, 'automatic', 25, null),
  ('square', true, 'automatic', 25, null),
  ('clover', true, 'automatic', 25, null),
  ('chownow', true, 'automatic', 25, null),
  ('olo', true, 'automatic', 25, null),
  ('popmenu', true, 'automatic', 25, null),
  ('menu_ocr', true, 'automatic', 30, null),
  ('unknown', true, 'automatic', 100, null),
  ('doordash', true, 'experimental', 40, null),
  ('grubhub', false, 'paused', 100, 'Paused after 270 runs produced zero items or photos'),
  ('yelp', false, 'disabled', 100, 'Not a durable corpus source for V1'),
  ('user_upload', true, 'first_party', 1, null),
  ('user_suggested', true, 'first_party', 1, null),
  ('merchant', true, 'first_party', 1, null)
on conflict (source) do update set
  enabled = excluded.enabled,
  mode = excluded.mode,
  priority = excluded.priority,
  paused_reason = excluded.paused_reason,
  updated_at = now();

create table if not exists source_states (
  entity_id uuid not null references restaurant_entities(id) on delete cascade,
  source text not null references source_registry(source),
  last_attempt_at timestamptz,
  last_success_at timestamptz,
  last_nonempty_at timestamptz,
  consecutive_empty int not null default 0,
  last_item_count int not null default 0,
  last_photo_count int not null default 0,
  last_error text,
  primary key(entity_id, source)
);

create table if not exists source_snapshots (
  id uuid primary key default gen_random_uuid(),
  entity_id uuid not null references restaurant_entities(id) on delete cascade,
  source text not null references source_registry(source),
  status text not null default 'running',
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  discovered_item_count int not null default 0,
  discovered_photo_count int not null default 0,
  accepted_item_count int not null default 0,
  accepted_photo_count int not null default 0,
  retained_item_count int not null default 0,
  retained_photo_count int not null default 0,
  error_code text,
  error_detail text,
  metadata jsonb not null default '{}'::jsonb
);
create index if not exists idx_source_snapshots_entity_source on source_snapshots(entity_id, source, started_at desc);

-- One canonical dish per location; source records and chain templates point here.
create table if not exists canonical_dishes (
  id uuid primary key default gen_random_uuid(),
  entity_id uuid not null references restaurant_entities(id) on delete cascade,
  name text not null,
  normalized_name text not null,
  description text,
  active boolean not null default true,
  confidence numeric not null default 0.5,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(entity_id, normalized_name)
);

alter table menu_items add column if not exists canonical_dish_id uuid references canonical_dishes(id);
alter table menu_items add column if not exists source_snapshot_id uuid references source_snapshots(id);
alter table menu_items add column if not exists source_key text;
alter table menu_items add column if not exists active boolean not null default true;
alter table menu_items add column if not exists first_seen_at timestamptz not null default now();
alter table menu_items add column if not exists last_seen_at timestamptz not null default now();
alter table menu_items add column if not exists missing_streak int not null default 0;

insert into canonical_dishes (entity_id, name, normalized_name, description, confidence)
select distinct on (r.entity_id, trim(regexp_replace(lower(m.name), '[^a-z0-9]+', ' ', 'g')))
  r.entity_id,
  m.name,
  trim(regexp_replace(lower(m.name), '[^a-z0-9]+', ' ', 'g')),
  m.description,
  case when m.source in ('user_suggested', 'merchant') then 1 else 0.7 end
from menu_items m
join restaurants r on r.place_id = m.restaurant_id
where r.entity_id is not null and trim(regexp_replace(lower(m.name), '[^a-z0-9]+', ' ', 'g')) <> ''
order by r.entity_id, trim(regexp_replace(lower(m.name), '[^a-z0-9]+', ' ', 'g')), m.id
on conflict (entity_id, normalized_name) do nothing;

update menu_items m
set canonical_dish_id = d.id
from restaurants r, canonical_dishes d
where r.place_id = m.restaurant_id
  and d.entity_id = r.entity_id
  and d.normalized_name = trim(regexp_replace(lower(m.name), '[^a-z0-9]+', ' ', 'g'))
  and m.canonical_dish_id is null;

alter table photos add column if not exists canonical_dish_id uuid references canonical_dishes(id);
alter table photos add column if not exists source_snapshot_id uuid references source_snapshots(id);
alter table photos add column if not exists active boolean not null default true;
alter table photos add column if not exists first_seen_at timestamptz not null default now();
alter table photos add column if not exists last_seen_at timestamptz not null default now();
alter table photos add column if not exists missing_streak int not null default 0;
alter table photos add column if not exists rights_status text not null default 'unreviewed';
alter table photos add column if not exists content_hash text;
alter table photos add column if not exists perceptual_hash text;

update photos p
set canonical_dish_id = m.canonical_dish_id
from menu_items m
where p.menu_item_id = m.id and p.canonical_dish_id is null;

create index if not exists idx_menu_items_canonical on menu_items(canonical_dish_id);
create index if not exists idx_menu_items_source_active on menu_items(restaurant_id, source, active);
create index if not exists idx_photos_canonical on photos(canonical_dish_id);
create index if not exists idx_photos_source_active on photos(restaurant_id, source, active);

-- Chain templates are inherited content. Location rows and all customer
-- photos remain attached to the restaurant entity where they were observed.
create table if not exists brands (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  normalized_name text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists restaurant_brand_memberships (
  entity_id uuid primary key references restaurant_entities(id) on delete cascade,
  brand_id uuid not null references brands(id) on delete cascade,
  confidence numeric not null default 0.8,
  source text not null default 'automatic',
  confirmed boolean not null default false
);

create table if not exists brand_menu_templates (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands(id) on delete cascade,
  name text not null,
  normalized_name text not null,
  description text,
  source text not null,
  active boolean not null default true,
  updated_at timestamptz not null default now(),
  unique(brand_id, normalized_name)
);

create table if not exists location_menu_overrides (
  entity_id uuid not null references restaurant_entities(id) on delete cascade,
  template_item_id uuid not null references brand_menu_templates(id) on delete cascade,
  available boolean,
  name text,
  description text,
  updated_at timestamptz not null default now(),
  primary key(entity_id, template_item_id)
);

-- Conservative automatic brand seed: exact normalized names appearing at
-- multiple locations. Admin/merchant confirmation can supersede this later.
insert into brands (name, normalized_name)
select min(name), normalized_name
from restaurant_entities
where status <> 'test_fixture'
group by normalized_name
having count(*) >= 2
on conflict (normalized_name) do nothing;

insert into restaurant_brand_memberships (entity_id, brand_id, confidence, source)
select e.id, b.id, 0.75, 'automatic_exact_name'
from restaurant_entities e
join brands b on b.normalized_name = e.normalized_name
on conflict (entity_id) do nothing;

insert into brand_menu_templates (brand_id, name, normalized_name, description, source)
select distinct on (m.brand_id, d.normalized_name)
  m.brand_id, d.name, d.normalized_name, d.description, 'location_rollup'
from restaurant_brand_memberships m
join canonical_dishes d on d.entity_id = m.entity_id
order by m.brand_id, d.normalized_name, d.confidence desc, d.updated_at desc
on conflict (brand_id, normalized_name) do nothing;

create table if not exists acquisition_jobs (
  id uuid primary key default gen_random_uuid(),
  entity_id uuid not null references restaurant_entities(id) on delete cascade,
  source text not null references source_registry(source),
  region_key text,
  status text not null default 'queued',
  priority int not null default 100,
  attempts int not null default 0,
  available_at timestamptz not null default now(),
  leased_until timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(entity_id, source)
);
create index if not exists idx_acquisition_jobs_queue on acquisition_jobs(status, available_at, priority);

insert into acquisition_jobs (entity_id, source, region_key, priority)
select entity_id, 'google', 'legacy-backlog', 20
from restaurants
where entity_id is not null and status = 'queued'
on conflict (entity_id, source) do nothing;

create table if not exists merchant_claims (
  id uuid primary key default gen_random_uuid(),
  entity_id uuid not null references restaurant_entities(id) on delete cascade,
  place_id text,
  contact_name text not null,
  email text not null,
  phone text,
  business_role text not null,
  plan text not null check (plan in ('standard', 'growth')),
  monthly_price int not null check (monthly_price in (99, 499)),
  authority_attested boolean not null,
  payment_attested boolean not null,
  status text not null default 'pending',
  review_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_merchant_claims_entity_status on merchant_claims(entity_id, status);

create or replace view restaurant_coverage_levels as
with menu_counts as (
  select r.entity_id, count(distinct m.canonical_dish_id) filter (where m.active) as menu_count
  from restaurants r left join menu_items m on m.restaurant_id = r.place_id
  group by r.entity_id
), photo_counts as (
  select
    r.entity_id,
    count(p.id) filter (where p.active) as photo_count,
    count(p.id) filter (where p.active and p.canonical_dish_id is not null) as matched_photo_count,
    count(p.id) filter (where p.active and p.photo_author_type = 'management') as management_photo_count,
    count(p.id) filter (where p.active and p.photo_author_type = 'customer') as customer_photo_count,
    count(distinct p.canonical_dish_id) filter (where p.active and p.comparison_ready) as comparison_dish_count
  from restaurants r left join photos p on p.restaurant_id = r.place_id
  group by r.entity_id
)
select
  e.id as entity_id,
  e.name,
  coalesce(m.menu_count, 0) as menu_count,
  coalesce(p.photo_count, 0) as photo_count,
  coalesce(p.matched_photo_count, 0) as matched_photo_count,
  coalesce(p.management_photo_count, 0) as management_photo_count,
  coalesce(p.customer_photo_count, 0) as customer_photo_count,
  coalesce(p.comparison_dish_count, 0) as comparison_dish_count,
  case
    when coalesce(p.comparison_dish_count, 0) >= 1 then 3
    when coalesce(p.matched_photo_count, 0) >= 5 then 2
    when coalesce(m.menu_count, 0) >= 1 then 1
    else 0
  end as coverage_level
from restaurant_entities e
left join menu_counts m on m.entity_id = e.id
left join photo_counts p on p.entity_id = e.id;
