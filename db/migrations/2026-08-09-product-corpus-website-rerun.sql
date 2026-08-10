-- A deliberately narrow queue for revisiting websites already attached to a
-- live SeeFood restaurant. This cannot fan out into unlaunched market-candidate
-- entities such as the San Diego research backbone.

insert into acquisition_markets(
  market_key,name,market_type,bounds,state_code,rollout_order,status
) values (
  'product-corpus-us','Live SeeFood restaurant corpus','nationwide',
  '{"west":-179.9,"south":18.0,"east":-66.0,"north":72.0}'::jsonb,
  null,0,'enriching'
)
on conflict(market_key) do update set
  name=excluded.name,market_type=excluded.market_type,bounds=excluded.bounds,
  rollout_order=excluded.rollout_order,status=excluded.status,updated_at=now();

create or replace function queue_web_crawl_v3_product_corpus(p_refresh boolean default false)
returns int language plpgsql security definer set search_path=public as $$
declare v_count int;
begin
  insert into web_crawl_jobs(entity_id,website_id,source,status,priority,available_at)
  select w.entity_id,w.id,'website_v3','queued',
    case
      when not exists (
        select 1 from restaurants r join photos p on p.restaurant_id=r.place_id
        where r.entity_id=w.entity_id and r.status<>'test_fixture' and p.active
          and p.is_orderable and not p.is_storefront
      ) then 0
      when (
        select count(*) from restaurants r join photos p on p.restaurant_id=r.place_id
        where r.entity_id=w.entity_id and r.status<>'test_fixture' and p.active
          and p.is_orderable and not p.is_storefront
      ) < 3 then 5
      else 20
    end + case when w.domain ~ '(toasttab|menufy|chownow|olo|popmenu|bentobox|spothopper|slicelife|flipdish|clover|square)' then 0 else 2 end,
    now()
  from (
    select distinct on(entity_id,lower(domain)) *
    from restaurant_websites
    where active
    order by entity_id,lower(domain),length(url),menu_item_count desc,updated_at desc
  ) w
  where w.active and exists (
    select 1 from restaurants r where r.entity_id=w.entity_id and r.status<>'test_fixture'
  )
  on conflict(website_id,source) do update set
    status=case when p_refresh and not(web_crawl_jobs.status='leased' and web_crawl_jobs.lease_expires_at>now()) then 'queued' else web_crawl_jobs.status end,
    priority=excluded.priority,
    available_at=case when p_refresh then now() else web_crawl_jobs.available_at end,
    completed_at=case when p_refresh then null else web_crawl_jobs.completed_at end,
    last_error=case when p_refresh then null else web_crawl_jobs.last_error end,
    updated_at=now();
  get diagnostics v_count=row_count;
  return v_count;
end $$;

create or replace function lease_web_crawl_v3_product_corpus(p_limit int default 25,p_lease_minutes int default 20)
returns setof web_crawl_jobs language plpgsql security definer set search_path=public as $$
declare v_token uuid := gen_random_uuid();
begin
  return query
  with candidates as (
    select j.id
    from web_crawl_jobs j
    join restaurant_websites w on w.id=j.website_id and w.active
    where j.source='website_v3'
      and exists (select 1 from restaurants r where r.entity_id=j.entity_id and r.status<>'test_fixture')
      and (j.status='queued' or (j.status='leased' and j.lease_expires_at<now()))
      and j.available_at<=now()
    order by j.priority,j.created_at,j.id
    for update skip locked
    limit greatest(1,least(p_limit,5000))
  )
  update web_crawl_jobs j set status='leased',lease_token=v_token,
    lease_expires_at=now()+make_interval(mins=>greatest(5,least(p_lease_minutes,120))),
    leased_at=now(),attempts=j.attempts+1,updated_at=now()
  from candidates c where j.id=c.id returning j.*;
end $$;

revoke all on function queue_web_crawl_v3_product_corpus(boolean) from public;
revoke all on function lease_web_crawl_v3_product_corpus(int,int) from public;
grant execute on function queue_web_crawl_v3_product_corpus(boolean) to service_role;
grant execute on function lease_web_crawl_v3_product_corpus(int,int) to service_role;
