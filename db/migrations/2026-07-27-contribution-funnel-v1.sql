-- DL-007: privacy-safe, idempotent known-dish contribution receipts.
-- The treatment experiment remains disabled. This schema records the existing
-- contribution surface and keeps new submissions nonpublic pending review.

create table if not exists contribution_attempts (
  id uuid primary key,
  visitor_id text not null,
  session_id text not null,
  restaurant_id text not null references restaurants(place_id) on delete cascade,
  menu_item_id bigint not null references menu_items(id) on delete restrict,
  experiment_key text not null default 'dl007_known_dish_v1',
  variant_key text not null default 'passive_existing_surface',
  surface text not null default 'known_dish'
    check (surface = 'known_dish'),
  traffic_class text not null default 'public_unverified'
    check (traffic_class in ('public_unverified', 'staff', 'automation', 'fixture', 'ineligible_entity')),
  entity_status text,
  rights_version text,
  rights_granted_at timestamptz,
  status text not null default 'started'
    check (status in (
      'started', 'cancelled', 'client_failed', 'upload_received',
      'storage_failed', 'record_failed', 'pending_review',
      'rejected', 'verified'
    )),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists contribution_funnel_events (
  attempt_id uuid not null references contribution_attempts(id) on delete cascade,
  event_name text not null check (event_name in (
    'eligible_prompt_impression',
    'prompt_open',
    'photo_source_choice',
    'file_selected',
    'file_cancelled',
    'client_preparation_result',
    'server_upload_received',
    'storage_result',
    'photo_record_result',
    'rights_grant_recorded',
    'moderation_result',
    'item_match_result',
    'duplicate_result',
    'verified_comparison_created'
  )),
  event_source text not null check (event_source in ('client', 'server', 'review')),
  outcome text not null check (outcome in (
    'observed', 'camera', 'library', 'success', 'failure',
    'cancelled', 'pending', 'approved', 'rejected',
    'matched', 'unmatched', 'unique', 'duplicate', 'created'
  )),
  occurred_at timestamptz not null default now(),
  primary key (attempt_id, event_name)
);

alter table photos
  add column if not exists contribution_attempt_id uuid
    references contribution_attempts(id) on delete set null;
alter table photos
  add column if not exists rights_version text;
alter table photos
  add column if not exists item_match_status text not null default 'not_reviewed';
alter table photos
  add column if not exists duplicate_review_status text not null default 'not_reviewed';
alter table photos
  add column if not exists published_at timestamptz;

create unique index if not exists idx_photos_contribution_attempt
  on photos(contribution_attempt_id)
  where contribution_attempt_id is not null;
create index if not exists idx_contribution_attempts_created
  on contribution_attempts(created_at desc);
create index if not exists idx_contribution_attempts_target
  on contribution_attempts(restaurant_id, menu_item_id, created_at desc);
create index if not exists idx_contribution_events_name_time
  on contribution_funnel_events(event_name, occurred_at desc);
