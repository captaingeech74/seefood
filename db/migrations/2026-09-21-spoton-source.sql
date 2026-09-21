-- Public restaurant ordering menus; free local collection only.
-- Existing administrative pause decisions must not be overridden.
insert into source_registry(source,enabled,mode,priority,paused_reason)
values('spoton',true,'automatic',25,null)
on conflict(source) do nothing;
