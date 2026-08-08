-- Reversible audit trail for website evidence rejected after collection.
create table if not exists website_observation_quarantine_log (
  id uuid primary key default gen_random_uuid(),
  observation_id bigint not null references website_menu_observations(id),
  crawl_run_id uuid references website_crawl_v3_runs(id),
  reason text not null,
  evidence_url text,
  root_url text,
  previous_active boolean not null,
  quarantined_at timestamptz not null default now(),
  unique(observation_id, reason)
);

create index if not exists website_observation_quarantine_run_idx
  on website_observation_quarantine_log(crawl_run_id, quarantined_at desc);
