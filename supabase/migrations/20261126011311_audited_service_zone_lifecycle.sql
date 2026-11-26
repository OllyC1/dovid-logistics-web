-- Audited zone creation and editing for the coverage workspace.
-- New zones are always inactive drafts without geometry. Any material change
-- to an active zone returns it to draft so it must be reviewed again.

create or replace function public.prepare_service_zone_change() returns trigger
language plpgsql security definer set search_path=public,pg_catalog as $$
begin
  if row(
    new.name,new.code,new.boundary_geojson,new.booking_eligibility,
    new.dispatch_approval_required,new.priority,new.effective_from,
    new.effective_until,new.boundary_source,new.is_citywide
  ) is distinct from row(
    old.name,old.code,old.boundary_geojson,old.booking_eligibility,
    old.dispatch_approval_required,old.priority,old.effective_from,
    old.effective_until,old.boundary_source,old.is_citywide
  ) then
    new.active := false;
    new.operational_status := 'draft';
    new.approved_by := null;
    new.approved_at := null;
    new.approval_boundary_hash := null;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.capture_service_zone_change() returns trigger
language plpgsql security definer set search_path=public,pg_catalog as $$
declare actor uuid;
declare reason text;
begin
  actor := nullif(current_setting('app.actor_id',true),'')::uuid;
  reason := nullif(trim(current_setting('app.change_reason',true)),'');
  insert into public.service_zone_change_history(
    zone_id,action,boundary_geojson,settings_snapshot,changed_by,change_reason
  ) values(
    new.id,
    case when tg_op='INSERT' then 'created' else 'updated' end,
    new.boundary_geojson,
    to_jsonb(new)-'boundary_geojson',
    actor,
    reason
  );
  return new;
end;
$$;

create or replace function public.create_service_zone_draft(
  target_service_area_id uuid,
  actor_id uuid,
  zone_name text,
  zone_code text,
  zone_booking_eligibility text,
  zone_dispatch_approval_required boolean,
  zone_priority integer,
  zone_effective_from timestamptz,
  zone_effective_until timestamptz,
  zone_boundary_source text,
  zone_review_notes text,
  creation_reason text
) returns uuid
language plpgsql security definer set search_path=public,private,pg_catalog as $$
declare created_zone_id uuid;
declare normalized_code text := upper(trim(zone_code));
begin
  if not private.has_staff_permission_for(actor_id,'zones.manage') then
    raise exception 'zone management authorization required';
  end if;
  if not exists(select 1 from public.service_areas where id=target_service_area_id) then
    raise exception 'service area not found';
  end if;
  if length(trim(zone_name)) not between 3 and 120 then
    raise exception 'zone name must be between 3 and 120 characters';
  end if;
  if length(normalized_code) not between 1 and 12 or normalized_code !~ '^[A-Z0-9][A-Z0-9_-]*$' then
    raise exception 'zone code must use 1 to 12 letters, numbers, dashes or underscores';
  end if;
  if zone_booking_eligibility not in ('standard','manual_approval','unavailable') then
    raise exception 'invalid booking eligibility';
  end if;
  if zone_priority not between 0 and 10000 then raise exception 'invalid zone priority'; end if;
  if zone_effective_until is not null and zone_effective_until<=zone_effective_from then
    raise exception 'the end date must be after the start date';
  end if;
  if length(trim(creation_reason))<8 then raise exception 'creation reason required'; end if;
  if length(coalesce(zone_boundary_source,''))>500 or length(coalesce(zone_review_notes,''))>2000 then
    raise exception 'zone evidence is too long';
  end if;

  perform set_config('app.actor_id',actor_id::text,true);
  perform set_config('app.change_reason',trim(creation_reason),true);
  insert into public.service_zones(
    service_area_id,name,code,boundary_geojson,active,operational_status,
    booking_eligibility,dispatch_approval_required,priority,effective_from,
    effective_until,boundary_source,review_notes,is_citywide
  ) values(
    target_service_area_id,trim(zone_name),normalized_code,null,false,'draft',
    zone_booking_eligibility,zone_dispatch_approval_required,zone_priority,
    zone_effective_from,zone_effective_until,nullif(trim(zone_boundary_source),''),
    nullif(trim(zone_review_notes),''),false
  ) returning id into created_zone_id;

  insert into public.audit_logs(actor_id,actor_type,action,resource_type,resource_id,metadata)
  values(actor_id,'admin','service_zone.created','service_zone',created_zone_id,
    jsonb_build_object('reason',trim(creation_reason),'code',normalized_code,'active',false,'boundaryProvided',false));
  return created_zone_id;
end;
$$;

create or replace function public.save_service_zone_draft(
  target_zone_id uuid,
  actor_id uuid,
  zone_name text,
  zone_code text,
  zone_boundary_geojson jsonb,
  zone_booking_eligibility text,
  zone_dispatch_approval_required boolean,
  zone_priority integer,
  zone_effective_from timestamptz,
  zone_effective_until timestamptz,
  zone_boundary_source text,
  zone_review_notes text,
  change_reason text
) returns jsonb
language plpgsql security definer set search_path=public,private,pg_catalog as $$
declare selected_zone public.service_zones%rowtype;
declare normalized_code text := upper(trim(zone_code));
declare material_change boolean;
begin
  if not private.has_staff_permission_for(actor_id,'zones.manage') then
    raise exception 'zone management authorization required';
  end if;
  if length(trim(change_reason))<8 then raise exception 'change reason required'; end if;
  if length(trim(zone_name)) not between 3 and 120 then
    raise exception 'zone name must be between 3 and 120 characters';
  end if;
  if length(normalized_code) not between 1 and 12 or normalized_code !~ '^[A-Z0-9][A-Z0-9_-]*$' then
    raise exception 'zone code must use 1 to 12 letters, numbers, dashes or underscores';
  end if;
  if zone_booking_eligibility not in ('standard','manual_approval','unavailable') then
    raise exception 'invalid booking eligibility';
  end if;
  if zone_priority not between 0 and 10000 then raise exception 'invalid zone priority'; end if;
  if zone_effective_until is not null and zone_effective_until<=zone_effective_from then
    raise exception 'the end date must be after the start date';
  end if;
  if zone_boundary_geojson is not null and not public.is_valid_zone_geojson(zone_boundary_geojson) then
    raise exception 'valid polygon geometry required';
  end if;
  if length(coalesce(zone_boundary_source,''))>500 or length(coalesce(zone_review_notes,''))>2000 then
    raise exception 'zone evidence is too long';
  end if;

  select * into selected_zone from public.service_zones where id=target_zone_id for update;
  if not found then raise exception 'service zone not found'; end if;
  material_change := row(
    trim(zone_name),normalized_code,zone_boundary_geojson,zone_booking_eligibility,
    zone_dispatch_approval_required,zone_priority,zone_effective_from,
    zone_effective_until,nullif(trim(zone_boundary_source),'')
  ) is distinct from row(
    selected_zone.name,selected_zone.code,selected_zone.boundary_geojson,
    selected_zone.booking_eligibility,selected_zone.dispatch_approval_required,
    selected_zone.priority,selected_zone.effective_from,selected_zone.effective_until,
    selected_zone.boundary_source
  );

  perform set_config('app.actor_id',actor_id::text,true);
  perform set_config('app.change_reason',trim(change_reason),true);
  update public.service_zones set
    name=trim(zone_name),code=normalized_code,boundary_geojson=zone_boundary_geojson,
    booking_eligibility=zone_booking_eligibility,
    dispatch_approval_required=zone_dispatch_approval_required,priority=zone_priority,
    effective_from=zone_effective_from,effective_until=zone_effective_until,
    boundary_source=nullif(trim(zone_boundary_source),''),
    review_notes=nullif(trim(zone_review_notes),'')
  where id=target_zone_id
  returning * into selected_zone;

  insert into public.audit_logs(actor_id,actor_type,action,resource_type,resource_id,metadata)
  values(actor_id,'admin','service_zone.draft_saved','service_zone',target_zone_id,
    jsonb_build_object('reason',trim(change_reason),'materialChange',material_change,
      'operationalStatus',selected_zone.operational_status,'active',selected_zone.active));
  return jsonb_build_object(
    'operationalStatus',selected_zone.operational_status,
    'active',selected_zone.active,
    'materialChange',material_change
  );
end;
$$;

create or replace function public.manage_service_zone_action(
  target_zone_id uuid,
  actor_id uuid,
  requested_action text,
  reason text
) returns void
language plpgsql security definer set search_path=public,private,pg_catalog as $$
begin
  if not private.has_staff_permission_for(actor_id,'zones.manage') then
    raise exception 'zone management authorization required';
  end if;
  if requested_action not in ('review','approve','activate','publish','suspend') then
    raise exception 'invalid zone action';
  end if;
  if length(trim(reason))<8 then raise exception 'zone action reason required'; end if;
  perform set_config('app.change_reason',trim(reason),true);

  case requested_action
    when 'review' then perform public.review_service_zone(target_zone_id,actor_id,reason);
    when 'approve' then perform public.approve_service_zone(target_zone_id,actor_id,reason);
    when 'activate' then perform public.activate_service_zone(target_zone_id,actor_id,reason);
    when 'publish' then perform public.publish_service_zone(target_zone_id,actor_id,reason);
    when 'suspend' then perform public.suspend_service_zone(target_zone_id,actor_id,reason);
  end case;

  if requested_action<>'publish' then
    insert into public.audit_logs(actor_id,actor_type,action,resource_type,resource_id,metadata)
    values(actor_id,'admin','service_zone.'||requested_action,'service_zone',target_zone_id,
      jsonb_build_object('reason',trim(reason)));
  end if;
end;
$$;

revoke all on function public.create_service_zone_draft(uuid,uuid,text,text,text,boolean,integer,timestamptz,timestamptz,text,text,text) from public,anon,authenticated;
revoke all on function public.save_service_zone_draft(uuid,uuid,text,text,jsonb,text,boolean,integer,timestamptz,timestamptz,text,text,text) from public,anon,authenticated;
revoke all on function public.manage_service_zone_action(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.create_service_zone_draft(uuid,uuid,text,text,text,boolean,integer,timestamptz,timestamptz,text,text,text) to service_role;
grant execute on function public.save_service_zone_draft(uuid,uuid,text,text,jsonb,text,boolean,integer,timestamptz,timestamptz,text,text,text) to service_role;
grant execute on function public.manage_service_zone_action(uuid,uuid,text,text) to service_role;
