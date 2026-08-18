-- Hard application-side stop for SeeFood's optional Google restaurant
-- discovery lane. Google Cloud quotas remain a second independent stop.
create table if not exists public.google_places_discovery_usage (
  usage_date date primary key,
  request_count integer not null default 0 check (request_count between 0 and 60),
  updated_at timestamptz not null default now()
);

alter table public.google_places_discovery_usage enable row level security;
revoke all on public.google_places_discovery_usage from anon, authenticated;

create or replace function public.claim_google_places_discovery_request()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  monthly_count integer;
  claimed_count integer;
begin
  -- Serialize the tiny counter so parallel serverless requests cannot pass the
  -- monthly check together. 1,800 is deliberately far below Google's current
  -- 5,000-request monthly Nearby Search allowance.
  perform pg_advisory_xact_lock(hashtext('seefood-google-places-discovery'));

  select coalesce(sum(request_count), 0)::integer
    into monthly_count
  from public.google_places_discovery_usage
  where usage_date >= date_trunc('month', current_date)::date
    and usage_date < (date_trunc('month', current_date) + interval '1 month')::date;

  if monthly_count >= 1800 then
    return false;
  end if;

  insert into public.google_places_discovery_usage (usage_date, request_count, updated_at)
  values (current_date, 1, now())
  on conflict (usage_date) do update
    set request_count = public.google_places_discovery_usage.request_count + 1,
        updated_at = now()
    where public.google_places_discovery_usage.request_count < 60
  returning request_count into claimed_count;

  return claimed_count is not null;
end;
$$;

revoke all on function public.claim_google_places_discovery_request() from public, anon, authenticated;
grant execute on function public.claim_google_places_discovery_request() to service_role;

