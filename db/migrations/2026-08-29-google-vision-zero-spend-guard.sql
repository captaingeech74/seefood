-- Hard application-side stop for the optional Google Vision upload gate.
-- Each image uses one Label Detection unit and one SafeSearch unit. The fixed
-- 800-image ceiling stays below Google's first 1,000 free units per feature.
create table if not exists public.google_vision_upload_usage (
  usage_month date primary key,
  request_count integer not null default 0 check (request_count between 0 and 800),
  updated_at timestamptz not null default now(),
  check (usage_month = date_trunc('month', usage_month)::date)
);

alter table public.google_vision_upload_usage enable row level security;
revoke all on public.google_vision_upload_usage from anon, authenticated;

create or replace function public.claim_google_vision_upload_request()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  current_month date := date_trunc('month', current_date)::date;
  claimed_count integer;
begin
  perform pg_advisory_xact_lock(hashtext('seefood-google-vision-upload'));

  insert into public.google_vision_upload_usage (usage_month, request_count, updated_at)
  values (current_month, 1, now())
  on conflict (usage_month) do update
    set request_count = public.google_vision_upload_usage.request_count + 1,
        updated_at = now()
    where public.google_vision_upload_usage.request_count < 800
  returning request_count into claimed_count;

  return claimed_count is not null;
end;
$$;

revoke all on function public.claim_google_vision_upload_request() from public, anon, authenticated;
grant execute on function public.claim_google_vision_upload_request() to service_role;
