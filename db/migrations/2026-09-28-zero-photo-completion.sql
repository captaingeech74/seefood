-- Conservative, reversible publication log for the coverage-first photo lane.
create table if not exists zero_photo_completion_runs (
  id uuid primary key default gen_random_uuid(),
  status text not null check (status in ('running','completed','failed','rolled_back')),
  mode text not null check (mode in ('preview','publish','rollback')),
  policy_version text not null,
  before_metrics jsonb not null default '{}'::jsonb,
  after_metrics jsonb not null default '{}'::jsonb,
  summary jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists zero_photo_completion_actions (
  id bigint generated always as identity primary key,
  run_id uuid not null references zero_photo_completion_runs(id) on delete cascade,
  entity_id uuid not null references restaurant_entities(id) on delete cascade,
  restaurant_id text not null references restaurants(place_id) on delete cascade,
  candidate_url text not null,
  content_hash text,
  decision text not null check (decision in ('published','withheld','failed')),
  reason text not null,
  dish_linked boolean not null default false,
  menu_item_id bigint references menu_items(id) on delete set null,
  photo_id bigint references photos(id) on delete set null,
  previous_photo_state jsonb,
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(run_id,restaurant_id,candidate_url)
);

create index if not exists idx_zero_photo_completion_actions_run
  on zero_photo_completion_actions(run_id,id);

revoke all on zero_photo_completion_runs,zero_photo_completion_actions from anon,authenticated;
