-- Apply only after the content-hash cleanup has completed.
-- NULL hashes and inactive audit rows remain allowed for legacy,
-- temporarily unreachable, and reversible cleanup records.
drop index if exists uq_photos_restaurant_content_hash;
create unique index if not exists uq_photos_restaurant_content_hash
  on photos(restaurant_id, content_hash)
  where active and content_hash is not null;
