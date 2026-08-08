-- Extract menu documents before spending time byte-verifying generic photos.
create or replace function lease_website_asset_jobs(p_run_id uuid,p_limit int default 25,p_lease_minutes int default 30)
returns setof website_asset_jobs language plpgsql security definer set search_path=public as $$
declare v_token uuid := gen_random_uuid();
begin
  return query
  with candidates as (
    select j.id from website_asset_jobs j
    where j.run_id=p_run_id and (j.status='queued' or (j.status='leased' and j.lease_expires_at<now())) and j.available_at<=now()
    order by case j.kind when 'pdf' then 0 when 'menu_image' then 1 else 2 end,j.created_at
    for update skip locked limit greatest(1,least(p_limit,500))
  )
  update website_asset_jobs j set status='leased',lease_token=v_token,
    lease_expires_at=now()+make_interval(mins=>greatest(5,least(p_lease_minutes,120))),attempts=j.attempts+1,updated_at=now()
  from candidates c where j.id=c.id returning j.*;
end $$;

revoke all on function lease_website_asset_jobs(uuid,int,int) from public;
grant execute on function lease_website_asset_jobs(uuid,int,int) to service_role;
