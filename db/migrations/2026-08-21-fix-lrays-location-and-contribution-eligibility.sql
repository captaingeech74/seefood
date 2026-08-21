-- Correct LRay's full location identity (the earlier migration changed only
-- the address text) and separate product photo intake from DL-007 sampling.

begin;

alter table contribution_attempts
  drop constraint if exists contribution_attempts_target_class_check;

alter table contribution_attempts
  add constraint contribution_attempts_target_class_check
  check (target_class in (
    'behavioral_prompt_candidate',
    'gold_comparison_candidate',
    'current_menu_item'
  ));

update restaurants
set address = '40900 Via Los Altos, Temecula, CA 92591',
    lat = 33.5276698,
    lng = -117.1172185,
    updated_at = now()
where place_id = 'ChIJa7SNNcl_24ARGN-49KRUqPI'
  and status = 'test_fixture';

update restaurant_entities
set address = '40900 Via Los Altos, Temecula, CA 92591',
    lat = 33.5276698,
    lng = -117.1172185,
    updated_at = now()
where id = (
  select entity_id
  from restaurants
  where place_id = 'ChIJa7SNNcl_24ARGN-49KRUqPI'
  limit 1
) and status = 'test_fixture';

update restaurant_identities
set address = '40900 Via Los Altos, Temecula, CA 92591',
    lat = 33.5276698,
    lng = -117.1172185,
    last_seen_at = now()
where provider = 'google'
  and provider_id = 'ChIJa7SNNcl_24ARGN-49KRUqPI'
  and entity_id = (
    select entity_id
    from restaurants
    where place_id = 'ChIJa7SNNcl_24ARGN-49KRUqPI'
    limit 1
  );

commit;
