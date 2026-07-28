-- DL-007 Stage 4: one canonical gold predicate, one-shot review, and
-- non-contradictory receipts. Treatment remains disabled.

alter table photos
  add column if not exists provenance_review_status text not null default 'not_reviewed'
    check (provenance_review_status in ('not_reviewed','verified','rejected'));
alter table photos
  add column if not exists usefulness_review_status text not null default 'not_reviewed'
    check (usefulness_review_status in ('not_reviewed','food_or_drink','rejected'));

alter table contribution_attempts
  add column if not exists analysis_eligibility text not null default 'unverified'
    check (analysis_eligibility in (
      'unverified','eligible_external','excluded_fixture','excluded_staff',
      'excluded_automation','excluded_ineligible_entity'
    ));

drop index if exists contribution_funnel_events_first_receipt;
create unique index contribution_funnel_events_first_receipt
  on contribution_funnel_events(attempt_id, event_name, event_source);

alter table contribution_funnel_events
  drop constraint if exists contribution_funnel_events_event_name_check;
alter table contribution_funnel_events
  add constraint contribution_funnel_events_event_name_check check (event_name in (
    'eligible_prompt_impression','prompt_open','photo_source_choice',
    'file_selected','file_cancelled','client_preparation_result',
    'analysis_eligibility_decision','server_upload_received',
    'server_optimization_result','storage_result','post_storage_target_result',
    'photo_record_result','rights_grant_recorded','moderation_result',
    'item_match_result','duplicate_result','publication_result',
    'verified_comparison_created'
  ));

alter table contribution_funnel_events
  drop constraint if exists contribution_funnel_events_outcome_check;
alter table contribution_funnel_events
  add constraint contribution_funnel_events_outcome_check check (outcome in (
    'observed','camera','library','success','failure','cancelled','pending',
    'approved','rejected','matched','unmatched','unique','duplicate','created',
    'eligible','ineligible','unverified'
  ));

create or replace function gold_management_counterpart(
  p_restaurant_id text,
  p_menu_item_id bigint,
  p_customer_photo_id bigint default null
) returns bigint
language sql
stable
as $$
  select management.id
  from restaurants r
  join restaurant_entities e on e.id = r.entity_id
  join menu_items m
    on m.restaurant_id = r.place_id and m.id = p_menu_item_id
  join source_snapshots menu_snapshot on menu_snapshot.id = m.source_snapshot_id
  join photos management on management.restaurant_id = r.place_id
  join source_snapshots photo_snapshot
    on photo_snapshot.id = management.source_snapshot_id
  left join photos customer on customer.id = p_customer_photo_id
  where r.place_id = p_restaurant_id
    and r.status = 'active'
    and e.status = 'active'
    and coalesce(e.operating_status, 'unknown')
      not in ('closed','permanently_closed')
    and m.active
    and m.missing_streak = 0
    and m.last_seen_at >= now() - interval '30 days'
    and menu_snapshot.status = 'succeeded'
    and not exists (
      select 1 from source_snapshots newer
      where newer.entity_id = menu_snapshot.entity_id
        and newer.source = menu_snapshot.source
        and newer.status = 'succeeded'
        and newer.completed_at > menu_snapshot.completed_at
    )
    and management.active
    and management.photo_author_type = 'management'
    and management.moderation_status = 'approved'
    and management.provenance_review_status = 'verified'
    and management.usefulness_review_status = 'food_or_drink'
    and management.rights_status in (
      'approved','granted','licensed','first_party_authorized'
    )
    and management.rights_scope in ('display_with_dish','licensed_display')
    and photo_snapshot.status = 'succeeded'
    and management.source is not null
    and management.source_platform is not null
    and (
      management.storage_url is not null
      or management.origin_url is not null
    )
    and management.is_orderable
    and not coalesce(management.is_storefront, false)
    and not coalesce(management.is_menu_photo, false)
    and (
      management.menu_item_id = m.id
      or exists (
        select 1 from photo_menu_item_links link
        where link.photo_id = management.id and link.menu_item_id = m.id
      )
    )
    and management.content_hash is not null
    and (
      select count(*) from photos exact_copy
      where exact_copy.restaurant_id = management.restaurant_id
        and exact_copy.active
        and exact_copy.content_hash = management.content_hash
    ) = 1
    and management.perceptual_hash is not null
    and management.duplicate_review_status = 'unique'
    and management.duplicate_of_photo_id is null
    and management.dedupe_reason is null
    and (customer.id is null or management.id <> customer.id)
    and (
      customer.id is null
      or management.content_hash is distinct from
        coalesce(customer.content_hash, customer.duplicate_hash)
    )
    and (
      customer.id is null
      or customer.perceptual_hash is null
      or management.perceptual_hash is distinct from customer.perceptual_hash
    )
  order by management.photo_quality_score desc nulls last, management.id
  limit 1
$$;

-- Recreate terminal review using the canonical counterpart function.
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
  v_attempt contribution_attempts%rowtype;
  v_photo photos%rowtype;
  v_publish boolean;
  v_management_id bigint;
begin
  if p_moderation not in ('approved','rejected')
     or p_item_match not in ('exact','strong','unmatched')
     or p_duplicate_review not in ('unique','duplicate')
     or p_rights_scope <> 'display_with_dish' then
    raise exception 'invalid terminal contribution review';
  end if;

  select * into v_attempt from contribution_attempts
  where id = p_attempt_id for update;
  if not found or v_attempt.status <> 'pending_review' then
    raise exception 'attempt is not pending one-shot review';
  end if;

  select * into v_photo from photos
  where contribution_attempt_id = p_attempt_id for update;
  if not found
     or v_photo.active
     or v_photo.published_at is not null
     or v_photo.moderation_status is distinct from 'pending'
     or v_photo.item_match_status is distinct from 'pending'
     or v_photo.duplicate_review_status is distinct from 'pending'
     or v_photo.rights_status is distinct from 'user_granted'
     or v_photo.rights_version is distinct from 'customer-photo-rights-v1'
     or v_photo.rights_scope is distinct from 'display_with_dish'
     or p_rights_scope is distinct from v_photo.rights_scope then
    raise exception 'photo is not pending with exact stored consent';
  end if;

  v_publish := p_moderation = 'approved'
    and p_item_match in ('exact','strong')
    and p_duplicate_review = 'unique';
  if v_publish then
    v_management_id := gold_management_counterpart(
      v_photo.restaurant_id, v_photo.menu_item_id, v_photo.id
    );
  end if;

  update photos set
    moderation_status = p_moderation,
    item_match_status = p_item_match,
    duplicate_review_status = p_duplicate_review,
    active = v_publish,
    published_at = case when v_publish then now() end,
    comparison_ready = v_management_id is not null
  where id = v_photo.id;

  update contribution_attempts set
    status = case when v_publish then 'verified' else 'rejected' end,
    updated_at = now()
  where id = p_attempt_id;

  insert into contribution_funnel_events
    (attempt_id,event_name,event_source,outcome)
  values
    (p_attempt_id,'moderation_result','review',p_moderation),
    (p_attempt_id,'item_match_result','review',
      case when p_item_match in ('exact','strong') then 'matched' else 'unmatched' end),
    (p_attempt_id,'duplicate_result','review',p_duplicate_review),
    (p_attempt_id,'publication_result','review',
      case when v_publish then 'approved' else 'rejected' end)
  on conflict (attempt_id,event_name,event_source) do nothing;

  if v_management_id is not null then
    insert into contribution_funnel_events
      (attempt_id,event_name,event_source,outcome)
    values (p_attempt_id,'verified_comparison_created','review','created')
    on conflict (attempt_id,event_name,event_source) do nothing;
  end if;
  return v_publish;
end
$$;

revoke all on function review_contribution_photo(uuid,text,text,text,text)
  from public, anon, authenticated;
grant execute on function review_contribution_photo(uuid,text,text,text,text)
  to service_role;
