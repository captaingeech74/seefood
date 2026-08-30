-- Official restaurant-owned social accounts are management provenance, not
-- anonymous web imagery. Register the source explicitly so we can preserve
-- the post permalink while serving a durable, byte-verified R2 copy.
insert into source_registry(source,enabled,mode,priority,paused_reason)
values('official_social',true,'automatic',14,null)
on conflict(source) do update set
  enabled=excluded.enabled,
  mode=excluded.mode,
  priority=excluded.priority,
  paused_reason=null,
  updated_at=now();
