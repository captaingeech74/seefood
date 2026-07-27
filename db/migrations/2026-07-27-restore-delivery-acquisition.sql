-- Grubhub was paused after its old static parser produced 270 empty runs.
-- The residential crawler now waits for the SPA and captures the current
-- first-party menu responses, so resume it alongside DoorDash.
update source_registry
set
  enabled = true,
  mode = 'automatic',
  priority = 40,
  paused_reason = null,
  updated_at = now()
where source = 'grubhub';

update source_registry
set
  enabled = true,
  mode = 'automatic',
  priority = 40,
  paused_reason = null,
  updated_at = now()
where source = 'doordash';
