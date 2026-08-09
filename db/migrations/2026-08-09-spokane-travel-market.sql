-- A bounded travel-QA market. It lets individual Spokane restaurants use the
-- normal identity, website-acquisition, publication, and rollback machinery
-- without beginning a full Spokane rollout.
insert into acquisition_markets(
  market_key,name,market_type,bounds,state_code,rollout_order,status
) values (
  'spokane-wa','Spokane, Washington','city',
  '{"west":-117.52,"south":47.58,"east":-117.30,"north":47.75}'::jsonb,
  'WA',50,'planned'
)
on conflict(market_key) do update set
  name=excluded.name,
  market_type=excluded.market_type,
  bounds=excluded.bounds,
  state_code=excluded.state_code,
  rollout_order=excluded.rollout_order,
  updated_at=now();
