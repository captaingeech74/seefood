begin;

update public.restaurants
set address = '40900 Via Los Altos, Temecula, CA 92591',
    updated_at = now()
where place_id = 'ChIJa7SNNcl_24ARGN-49KRUqPI'
  and status = 'test_fixture';

update public.restaurant_entities
set address = '40900 Via Los Altos, Temecula, CA 92591',
    updated_at = now()
where id = '02dcd951-a43f-4ac0-aad5-503e9cf7c27d'
  and status = 'test_fixture';

update public.restaurant_identities
set address = '40900 Via Los Altos, Temecula, CA 92591',
    last_seen_at = now()
where provider = 'google'
  and provider_id = 'ChIJa7SNNcl_24ARGN-49KRUqPI'
  and entity_id = '02dcd951-a43f-4ac0-aad5-503e9cf7c27d';

commit;
