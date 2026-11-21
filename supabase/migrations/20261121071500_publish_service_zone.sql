create or replace function public.publish_service_zone(target_zone_id uuid, actor_id uuid, reason text)
returns void language plpgsql security definer set search_path=public,auth,extensions,pg_catalog as $$
declare selected_zone public.service_zones%rowtype;
begin
  if length(trim(reason)) < 8 then raise exception 'publication reason required'; end if;
  if not exists(
    select 1
    from public.staff_memberships membership
    join public.profiles profile on profile.id=membership.user_id
    where membership.user_id=actor_id
      and membership.staff_role='super_admin'
      and membership.status='active'
      and profile.role='admin'
  ) then
    raise exception 'Super Admin authorization required';
  end if;

  select * into selected_zone from public.service_zones where id=target_zone_id for update;
  if not found then raise exception 'service zone not found'; end if;
  if not public.is_valid_zone_geojson(selected_zone.boundary_geojson) then raise exception 'valid reviewed polygon required'; end if;
  if selected_zone.booking_eligibility='unavailable' then raise exception 'booking eligibility must be reviewed before publication'; end if;
  if selected_zone.effective_from>now() or (selected_zone.effective_until is not null and selected_zone.effective_until<=now()) then
    raise exception 'zone is outside its effective dates';
  end if;

  perform set_config('app.actor_id',actor_id::text,true);
  update public.service_zones
  set operational_status='in_review',active=false,review_notes=reason,updated_at=now()
  where id=target_zone_id;
  update public.service_zones
  set operational_status='approved',active=false,approved_by=actor_id,approved_at=now(),
      approval_boundary_hash=encode(extensions.digest(boundary_geojson::text,'sha256'),'hex'),
      review_notes=reason,updated_at=now()
  where id=target_zone_id;
  update public.service_zones
  set operational_status='active',active=true,review_notes=reason,updated_at=now()
  where id=target_zone_id;

  insert into public.audit_logs(actor_id,actor_type,action,resource_type,resource_id,metadata)
  values(
    actor_id,'admin','service_zone.published','service_zone',target_zone_id,
    jsonb_build_object('reason',reason,'bookingEligibility',selected_zone.booking_eligibility)
  );
end;
$$;

revoke all on function public.publish_service_zone(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.publish_service_zone(uuid,uuid,text) to service_role;
