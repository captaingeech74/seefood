-- Auditable official-website recovery for entities whose stored URLs did not
-- produce menu evidence. Candidate evidence is retained even when rejected.

create table if not exists website_url_recovery_runs (
  id uuid primary key default gen_random_uuid(),
  market_key text not null references acquisition_markets(market_key),
  status text not null default 'running' check(status in ('running','completed','failed','cancelled')),
  configuration jsonb not null default '{}'::jsonb,
  searched_count int not null default 0,
  accepted_count int not null default 0,
  rejected_count int not null default 0,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists website_url_recovery_candidates (
  id bigint generated always as identity primary key,
  run_id uuid not null references website_url_recovery_runs(id) on delete cascade,
  entity_id uuid not null references restaurant_entities(id) on delete cascade,
  query text not null,
  candidate_url text,
  candidate_domain text,
  result_title text,
  score numeric not null default 0,
  status text not null check(status in ('accepted','rejected','no_result','failed')),
  evidence jsonb not null default '{}'::jsonb,
  website_id uuid references restaurant_websites(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(run_id,entity_id)
);

revoke all on website_url_recovery_runs,website_url_recovery_candidates from anon,authenticated;

