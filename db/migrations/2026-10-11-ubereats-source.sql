-- Uber Eats merchant menu pages can provide exact dish-to-photo evidence.
-- Keep this source distinct so provenance is never mislabeled as DoorDash.
insert into source_registry(source,enabled,mode,priority,paused_reason,updated_at)
values('ubereats',true,'automatic',40,null,now())
on conflict(source) do update set
  enabled=true,
  mode='automatic',
  priority=40,
  paused_reason=null,
  updated_at=now();
