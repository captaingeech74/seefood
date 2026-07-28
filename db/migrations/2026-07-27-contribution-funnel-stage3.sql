-- DL-007 Stage 3: immutable receipts, explicit target class, exact consent
-- scope, and an atomic terminal review transition. The treatment stays off.

alter table contribution_attempts
  add column if not exists target_class text
    check (target_class in ('behavioral_prompt_candidate', 'gold_comparison_candidate'));

alter table photos
  add column if not exists rights_scope text;

alter table contribution_funnel_events
  drop constraint if exists contribution_funnel_events_pkey;
alter table contribution_funnel_events
  add column if not exists id bigserial;
alter table contribution_funnel_events
  add constraint contribution_funnel_events_pkey primary key (id);

drop index if exists contribution_funnel_events_first_receipt;
create unique index contribution_funnel_events_first_receipt
  on contribution_funnel_events(attempt_id, event_name, event_source, outcome);

alter table contribution_funnel_events
  drop constraint if exists contribution_funnel_events_event_name_check;
alter table contribution_funnel_events
  add constraint contribution_funnel_events_event_name_check check (event_name in (
    'eligible_prompt_impression',
    'prompt_open',
    'photo_source_choice',
    'file_selected',
    'file_cancelled',
    'client_preparation_result',
    'server_upload_received',
    'server_optimization_result',
    'storage_result',
    'post_storage_target_result',
    'photo_record_result',
    'rights_grant_recorded',
    'moderation_result',
    'item_match_result',
    'duplicate_result',
    'publication_result',
    'verified_comparison_created'
  ));

create or replace function review_contribution_photo(
  p_attempt_id uuid,
  p_moderation text,
  p_item_match text,
  p_duplicate_review text,
  p_rights_scope text
) returns boolean
language plpgsql
as $$
declare
  v_photo photos%rowtype;
  v_publish boolean;
  v_comparison boolean;
begin
  if p_moderation not in ('approved', 'rejected')
     or p_item_match not in ('exact', 'strong', 'unmatched')
     or p_duplicate_review not in ('unique', 'duplicate')
     or p_rights_scope <> 'display_with_dish' then
    raise exception 'invalid terminal contribution review';
  end if;

  select * into v_photo
  from photos
  where contribution_attempt_id = p_attempt_id
  for update;

  if not found or v_photo.active or v_photo.published_at is not null then
    raise exception 'contribution is not pending terminal review';
  end if;

  v_publish :=
    p_moderation = 'approved'
    and p_item_match in ('exact', 'strong')
    and p_duplicate_review = 'unique'
    and v_photo.rights_status = 'user_granted'
    and v_photo.rights_version = 'customer-photo-rights-v1'
    and coalesce(v_photo.rights_scope, p_rights_scope) = 'display_with_dish';

  v_comparison := v_publish and exists (
    select 1
    from photos management
    where management.restaurant_id = v_photo.restaurant_id
      and management.active
      and management.photo_author_type = 'management'
      and management.moderation_status = 'approved'
      and management.rights_status in (
        'approved', 'granted', 'licensed', 'first_party_authorized'
      )
      and management.source is not null
      and management.source_platform is not null
      and management.trust_label is not null
      and management.content_hash is not null
      and management.perceptual_hash is not null
      and management.duplicate_of_photo_id is null
      and management.dedupe_reason is null
      and not coalesce(management.is_storefront, false)
      and not coalesce(management.is_menu_photo, false)
      and (
        management.menu_item_id = v_photo.menu_item_id
        or (
          v_photo.canonical_dish_id is not null
          and management.canonical_dish_id = v_photo.canonical_dish_id
        )
      )
  );

  update photos
  set moderation_status = p_moderation,
      item_match_status = p_item_match,
      duplicate_review_status = p_duplicate_review,
      rights_scope = p_rights_scope,
      active = v_publish,
      published_at = case when v_publish then now() else null end,
      comparison_ready = v_comparison
  where id = v_photo.id;

  update contribution_attempts
  set status = case when v_publish then 'verified' else 'rejected' end,
      updated_at = now()
  where id = p_attempt_id;

  insert into contribution_funnel_events
    (attempt_id, event_name, event_source, outcome)
  values
    (p_attempt_id, 'moderation_result', 'review', p_moderation),
    (p_attempt_id, 'item_match_result', 'review',
      case when p_item_match in ('exact','strong') then 'matched' else 'unmatched' end),
    (p_attempt_id, 'duplicate_result', 'review', p_duplicate_review),
    (p_attempt_id, 'publication_result', 'review',
      case when v_publish then 'approved' else 'rejected' end)
  on conflict (attempt_id, event_name, event_source, outcome) do nothing;

  if v_comparison then
    insert into contribution_funnel_events
      (attempt_id, event_name, event_source, outcome)
    values
      (p_attempt_id, 'verified_comparison_created', 'review', 'created')
    on conflict (attempt_id, event_name, event_source, outcome) do nothing;
  end if;

  return v_publish;
end;
$$;
