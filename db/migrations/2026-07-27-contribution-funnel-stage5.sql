-- DL-007 Push 5: one database-owned measurement contract.
-- The contribution treatment remains disabled.

alter table photos
  add column if not exists management_rights_review_status text not null
    default 'not_reviewed'
    check (management_rights_review_status in ('not_reviewed','approved','rejected'));
alter table photos
  add column if not exists management_rights_reviewed_at timestamptz;
alter table photos
  add column if not exists management_rights_review_basis text;

create or replace function contribution_behavioral_contract(
  p_restaurant_id text,
  p_menu_item_id bigint
) returns jsonb
language sql
stable
as $$
  with context as (
    select
      r.place_id,
      r.status restaurant_status,
      e.id entity_id,
      e.status entity_status,
      e.operating_status,
      m.id menu_item_id,
      m.active menu_active,
      m.missing_streak,
      m.last_seen_at,
      m.source menu_source,
      m.source_snapshot_id,
      s.id snapshot_id,
      s.status snapshot_status,
      s.entity_id snapshot_entity_id,
      s.source snapshot_source,
      not exists (
        select 1
        from source_snapshots newer
        where newer.entity_id = e.id
          and newer.source = m.source
          and newer.status = 'succeeded'
          and newer.completed_at > s.completed_at
      ) latest_successful_snapshot
    from restaurants r
    join restaurant_entities e on e.id = r.entity_id
    join menu_items m
      on m.restaurant_id = r.place_id and m.id = p_menu_item_id
    left join source_snapshots s on s.id = m.source_snapshot_id
    where r.place_id = p_restaurant_id
  ), gates as (
    select
      restaurant_status = 'active' active_restaurant,
      entity_status = 'active' active_entity,
      coalesce(operating_status, 'unknown')
        not in ('closed','permanently_closed') operating_status_not_closed,
      menu_active active_menu_item,
      missing_streak = 0 zero_missing_streak,
      last_seen_at >= now() - interval '30 days' observed_within_30_days,
      snapshot_id is not null
        and snapshot_status = 'succeeded'
        and snapshot_entity_id = entity_id
        and snapshot_source = menu_source
        and latest_successful_snapshot latest_successful_source_snapshot
    from context
  )
  select coalesce((
    select jsonb_build_object(
      'eligible',
        active_restaurant and active_entity and operating_status_not_closed
        and active_menu_item and zero_missing_streak
        and observed_within_30_days and latest_successful_source_snapshot,
      'gates', jsonb_build_object(
        'activeRestaurant', active_restaurant,
        'activeEntity', active_entity,
        'operatingStatusNotClosed', operating_status_not_closed,
        'activeMenuItem', active_menu_item,
        'zeroMissingStreak', zero_missing_streak,
        'observedWithin30Days', observed_within_30_days,
        'latestSuccessfulSourceSnapshot', latest_successful_source_snapshot
      )
    ) from gates
  ), jsonb_build_object(
    'eligible', false,
    'gates', jsonb_build_object(
      'activeRestaurant', false,
      'activeEntity', false,
      'operatingStatusNotClosed', false,
      'activeMenuItem', false,
      'zeroMissingStreak', false,
      'observedWithin30Days', false,
      'latestSuccessfulSourceSnapshot', false
    )
  ))
$$;

create or replace function contribution_management_photo_contract(
  p_restaurant_id text,
  p_menu_item_id bigint,
  p_management_photo_id bigint,
  p_customer_photo_id bigint default null
) returns jsonb
language sql
stable
as $$
  with base as (
    select
      r.place_id restaurant_id,
      e.id entity_id,
      m.id menu_item_id,
      m.canonical_dish_id,
      contribution_behavioral_contract(r.place_id, m.id) behavioral
    from restaurants r
    join restaurant_entities e on e.id = r.entity_id
    join menu_items m
      on m.restaurant_id = r.place_id and m.id = p_menu_item_id
    where r.place_id = p_restaurant_id
  ), candidate as (
    select
      p.id photo_id,
      p.photo_quality_score,
      b.behavioral,
      jsonb_build_object(
        'behavioralEligible', (b.behavioral->>'eligible')::boolean,
        'activeUsefulManagementPhoto',
          p.active and p.photo_author_type = 'management'
          and p.moderation_status = 'approved'
          and p.is_orderable
          and not coalesce(p.is_storefront,false)
          and not coalesce(p.is_menu_photo,false),
        'accessibleRecordedLocator',
          p.storage_url is not null or p.origin_url is not null,
        'successfulBoundPhotoSnapshot',
          ps.id is not null and ps.status = 'succeeded'
          and ps.entity_id = b.entity_id and ps.source = p.source,
        'independentProvenanceReview',
          p.provenance_review_status = 'verified',
        'independentDisplayRightsReview',
          p.management_rights_review_status = 'approved'
          and p.management_rights_reviewed_at is not null
          and p.management_rights_review_basis is not null,
        'usefulnessReview',
          p.usefulness_review_status = 'food_or_drink',
        'reviewedDisplayRights',
          p.rights_status in
            ('approved','granted','licensed','first_party_authorized')
          and p.rights_scope in ('display_with_dish','licensed_display'),
        'exactOrExplicitItemLink',
          p.menu_item_id = b.menu_item_id or exists (
            select 1 from photo_menu_item_links l
            where l.photo_id = p.id and l.menu_item_id = b.menu_item_id
          ),
        'exactHashUniqueAtRestaurant',
          p.content_hash is not null and (
            select count(*) from photos copy
            where copy.restaurant_id = p.restaurant_id
              and copy.active and copy.content_hash = p.content_hash
          ) = 1,
        'perceptualHashMeasured', p.perceptual_hash is not null,
        'independentNearDuplicateReview',
          p.duplicate_review_status = 'unique',
        'noDuplicateParentOrReason',
          p.duplicate_of_photo_id is null and p.dedupe_reason is null,
        'distinctFromCustomer',
          customer.id is null or (
            p.id <> customer.id
            and p.content_hash is distinct from
              coalesce(customer.content_hash,customer.duplicate_hash)
            and (
              customer.perceptual_hash is null
              or p.perceptual_hash is distinct from customer.perceptual_hash
            )
          ),
        'lacksVerifiedCustomerSameDish', not exists (
          select 1
          from restaurants cr
          join photos cp on cp.restaurant_id = cr.place_id
          where cr.entity_id = b.entity_id
            and cp.active
            and cp.photo_author_type = 'customer'
            and cp.moderation_status = 'approved'
            and cp.rights_status = 'user_granted'
            and cp.rights_version = 'customer-photo-rights-v1'
            and cp.rights_scope = 'display_with_dish'
            and cp.published_at is not null
            and cp.item_match_status in ('exact','strong')
            and cp.duplicate_review_status = 'unique'
            and (
              cp.menu_item_id = b.menu_item_id
              or (
                b.canonical_dish_id is not null
                and cp.canonical_dish_id = b.canonical_dish_id
              )
            )
            and cp.id is distinct from p_customer_photo_id
        )
      ) gates
    from base b
    join photos p
      on p.restaurant_id = b.restaurant_id
      and p.id = p_management_photo_id
      and p.photo_author_type = 'management'
      and (
        p.menu_item_id = b.menu_item_id
        or exists (
          select 1 from photo_menu_item_links l
          where l.photo_id = p.id and l.menu_item_id = b.menu_item_id
        )
      )
    left join source_snapshots ps on ps.id = p.source_snapshot_id
    left join photos customer on customer.id = p_customer_photo_id
  )
  select coalesce((
    select jsonb_build_object(
      'eligible', not exists (
        select 1 from jsonb_each(gates) gate where gate.value <> 'true'::jsonb
      ),
      'selectedPhotoId', photo_id,
      'behavioral', behavioral,
      'gates', gates
    ) from candidate
  ), jsonb_build_object(
    'eligible', false,
    'selectedPhotoId', null,
    'behavioral', contribution_behavioral_contract(
      p_restaurant_id,p_menu_item_id
    ),
    'gates', jsonb_build_object('attachedManagementPhoto',false)
  ))
$$;

create or replace function contribution_gold_contract(
  p_restaurant_id text,
  p_menu_item_id bigint,
  p_customer_photo_id bigint default null
) returns jsonb
language sql
stable
as $$
  with candidates as (
    select
      p.id photo_id,
      p.photo_quality_score,
      contribution_management_photo_contract(
        p_restaurant_id,p_menu_item_id,p.id,p_customer_photo_id
      ) contract
    from photos p
    where p.restaurant_id = p_restaurant_id
      and p.photo_author_type = 'management'
      and (
        p.menu_item_id = p_menu_item_id
        or exists (
          select 1 from photo_menu_item_links l
          where l.photo_id = p.id and l.menu_item_id = p_menu_item_id
        )
      )
  )
  select coalesce((
    select contract
    from candidates
    order by
      (contract->>'eligible')::boolean desc,
      photo_quality_score desc nulls last,
      photo_id
    limit 1
  ), jsonb_build_object(
    'eligible', false,
    'selectedPhotoId', null,
    'behavioral', contribution_behavioral_contract(
      p_restaurant_id,p_menu_item_id
    ),
    'gates', jsonb_build_object('attachedManagementPhoto',false)
  ))
$$;

create or replace function gold_management_counterpart(
  p_restaurant_id text,
  p_menu_item_id bigint,
  p_customer_photo_id bigint default null
) returns bigint
language sql
stable
as $$
  select case
    when (contract->>'eligible')::boolean
      then (contract->>'selectedPhotoId')::bigint
  end
  from (
    select contribution_gold_contract(
      p_restaurant_id,p_menu_item_id,p_customer_photo_id
    ) contract
  ) resolved
$$;

revoke all on function contribution_behavioral_contract(text,bigint)
  from public, anon, authenticated;
revoke all on function contribution_management_photo_contract(
  text,bigint,bigint,bigint
) from public, anon, authenticated;
revoke all on function contribution_gold_contract(text,bigint,bigint)
  from public, anon, authenticated;
grant execute on function contribution_behavioral_contract(text,bigint)
  to service_role;
grant execute on function contribution_management_photo_contract(
  text,bigint,bigint,bigint
) to service_role;
grant execute on function contribution_gold_contract(text,bigint,bigint)
  to service_role;
