-- Separate an entered motorcycle plate from independently reviewed registration
-- evidence. Test or mistyped plates must never unlock booking or dispatch capacity.

alter table public.fleet_vehicles
  add column if not exists registration_verified_at timestamptz,
  add column if not exists registration_verified_by uuid references public.profiles(id) on delete restrict,
  add column if not exists registration_verification_method text,
  add column if not exists registration_verification_reference text;

alter table public.fleet_vehicles
  drop constraint if exists fleet_vehicles_registration_verification_evidence,
  add constraint fleet_vehicles_registration_verification_evidence
    check (
      (
        registration_verified_at is null
        and registration_verified_by is null
        and registration_verification_method is null
        and registration_verification_reference is null
      )
      or (
        registration_verified_at is not null
        and registration_verified_by is not null
        and coalesce(length(trim(registration_verification_method)), 0) >= 4
        and coalesce(length(trim(registration_verification_reference)), 0) >= 4
      )
    );

create index if not exists idx_fleet_vehicles_registration_verified_by
  on public.fleet_vehicles (registration_verified_by)
  where registration_verified_by is not null;

create or replace function private.enforce_fleet_vehicle_readiness()
returns trigger
language plpgsql
set search_path=''
as $$
begin
  if new.registration_number is not null then
    new.registration_number := upper(trim(regexp_replace(new.registration_number, '\s+', ' ', 'g')));
  end if;

  -- A changed plate cannot inherit evidence recorded for the previous plate.
  -- A trusted server may replace the plate and provide fresh evidence atomically.
  if tg_op = 'UPDATE'
    and new.registration_number is distinct from old.registration_number
    and new.registration_verified_at is not null
    and new.registration_verified_at is not distinct from old.registration_verified_at then
    new.registration_verified_at := null;
    new.registration_verified_by := null;
    new.registration_verification_method := null;
    new.registration_verification_reference := null;
  end if;

  if new.registration_verified_at is not null then
    if new.registration_number is null
      or nullif(trim(new.manufacturer), '') is null
      or nullif(trim(new.model), '') is null
      or new.model_year is null then
      raise exception 'record the physical motorcycle plate, manufacturer, model and model year before verifying its registration';
    end if;
    if new.registration_verified_at > now() + interval '1 minute' then
      raise exception 'registration verification time cannot be in the future';
    end if;
  end if;

  if new.assigned_rider_id is not null and not exists (
    select 1
    from public.staff_memberships membership
    join public.profiles profile on profile.id=membership.user_id
    where membership.user_id=new.assigned_rider_id
      and membership.staff_role='rider'
      and membership.status='active'
      and profile.role='rider'
      and nullif(trim(profile.full_name),'') is not null
  ) then
    raise exception 'choose an active rider with a recorded name';
  end if;

  if new.operational_status in ('available','assigned') then
    if new.registration_number is null or new.registration_verified_at is null then
      raise exception 'verify the physical motorcycle registration before activation';
    end if;
    if new.assigned_rider_id is null then
      raise exception 'assign an active rider before activation';
    end if;
    if new.safety_status <> 'cleared' then
      raise exception 'complete the motorcycle safety review before activation';
    end if;
    if new.capacity_verified_at is null
      or new.max_payload_weight_grams is null
      or new.cargo_length_mm is null
      or new.cargo_width_mm is null
      or new.cargo_height_mm is null then
      raise exception 'record and verify motorcycle capacity before activation';
    end if;
  end if;

  return new;
end;
$$;

create or replace function private.enforce_dispatch_resource_readiness()
returns trigger
language plpgsql
set search_path=''
as $$
declare
  target_rider uuid;
  target_vehicle uuid;
  vehicle_record public.fleet_vehicles%rowtype;
  assignment_open boolean;
begin
  target_rider := new.rider_id;
  target_vehicle := new.vehicle_id;
  if tg_table_name='delivery_assignments' then
    assignment_open := (to_jsonb(new)->>'released_at') is null;
  else
    assignment_open := (to_jsonb(new)->>'status') in ('planned','active','paused');
  end if;
  if not assignment_open then return new; end if;

  if not exists (
    select 1
    from public.staff_memberships membership
    join public.profiles profile on profile.id=membership.user_id
    where membership.user_id=target_rider
      and membership.staff_role='rider'
      and membership.status='active'
      and profile.role='rider'
      and nullif(trim(profile.full_name),'') is not null
  ) then
    raise exception 'an active identity-verified rider is required';
  end if;

  select * into vehicle_record from public.fleet_vehicles where id=target_vehicle;
  if not found
    or vehicle_record.registration_number is null
    or vehicle_record.registration_verified_at is null
    or nullif(trim(vehicle_record.registration_verification_method), '') is null
    or nullif(trim(vehicle_record.registration_verification_reference), '') is null
    or nullif(trim(vehicle_record.manufacturer), '') is null
    or nullif(trim(vehicle_record.model), '') is null
    or vehicle_record.model_year is null
    or vehicle_record.safety_status <> 'cleared'
    or vehicle_record.capacity_verified_at is null
    or vehicle_record.assigned_rider_id is distinct from target_rider then
    raise exception 'a registration-verified, safety-cleared bike assigned to this rider is required';
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_fleet_vehicle_readiness() from public,anon,authenticated;
revoke all on function private.enforce_dispatch_resource_readiness() from public,anon,authenticated;

create or replace function public.update_fleet_vehicle_configuration(
  target_vehicle_id uuid,
  actor_id uuid,
  new_registration_number text,
  new_registration_verified boolean,
  new_registration_verification_method text,
  new_registration_verification_reference text,
  new_manufacturer text,
  new_model text,
  new_model_year integer,
  new_assigned_rider_id uuid,
  new_operational_status text,
  new_safety_status text,
  new_max_active_assignments integer,
  new_max_payload_weight_grams integer,
  new_cargo_length_mm integer,
  new_cargo_width_mm integer,
  new_cargo_height_mm integer,
  new_capacity_verified boolean,
  change_reason text
) returns jsonb
language plpgsql
security definer
set search_path=public,private,pg_catalog
as $$
declare
  selected_vehicle public.fleet_vehicles%rowtype;
  normalized_registration text;
  verification_time timestamptz;
begin
  if length(trim(change_reason)) < 8 then
    raise exception 'a clear fleet change reason is required';
  end if;
  if not exists (
    select 1
    from public.profiles profile
    join public.staff_memberships membership on membership.user_id=profile.id
    where profile.id=actor_id
      and profile.role='admin'
      and membership.status='active'
      and membership.staff_role in ('admin','super_admin')
      and (
        membership.staff_role='super_admin'
        or exists (
          select 1 from public.staff_permission_grants permission
          where permission.user_id=actor_id and permission.permission_key='dispatch.manage'
        )
      )
  ) then
    raise exception 'active dispatch manager authorization required';
  end if;

  select * into selected_vehicle
  from public.fleet_vehicles
  where id=target_vehicle_id
  for update;
  if not found then raise exception 'motorcycle not found'; end if;

  if exists (
    select 1 from public.delivery_assignments assignment
    where assignment.vehicle_id=target_vehicle_id and assignment.released_at is null
  ) or exists (
    select 1 from public.delivery_runs run
    where run.vehicle_id=target_vehicle_id and run.status in ('planned','active','paused')
  ) then
    raise exception 'motorcycle has active delivery work';
  end if;

  normalized_registration := upper(trim(regexp_replace(new_registration_number, '\s+', ' ', 'g')));
  if normalized_registration is distinct from selected_vehicle.registration_number
    and new_registration_verified
    and nullif(trim(new_registration_verification_reference), '') is not distinct from selected_vehicle.registration_verification_reference then
    raise exception 'a changed plate requires a new registration evidence reference';
  end if;
  verification_time := case when new_registration_verified or new_capacity_verified then now() else null end;

  update public.fleet_vehicles
  set registration_number=normalized_registration,
      registration_verified_at=case when new_registration_verified then verification_time else null end,
      registration_verified_by=case when new_registration_verified then actor_id else null end,
      registration_verification_method=case when new_registration_verified then nullif(trim(new_registration_verification_method),'') else null end,
      registration_verification_reference=case when new_registration_verified then nullif(trim(new_registration_verification_reference),'') else null end,
      manufacturer=nullif(trim(new_manufacturer),''),
      model=nullif(trim(new_model),''),
      model_year=new_model_year,
      assigned_rider_id=new_assigned_rider_id,
      operational_status=new_operational_status,
      safety_status=new_safety_status,
      max_active_assignments=new_max_active_assignments,
      max_payload_weight_grams=new_max_payload_weight_grams,
      cargo_length_mm=new_cargo_length_mm,
      cargo_width_mm=new_cargo_width_mm,
      cargo_height_mm=new_cargo_height_mm,
      capacity_verified_at=case when new_capacity_verified then verification_time else null end,
      capacity_verified_by=case when new_capacity_verified then actor_id else null end,
      updated_at=now()
  where id=target_vehicle_id;

  insert into public.audit_logs(
    actor_id,actor_type,action,resource_type,resource_id,metadata
  ) values (
    actor_id,'admin','fleet.vehicle.updated','fleet_vehicle',target_vehicle_id,
    jsonb_strip_nulls(jsonb_build_object(
      'registrationNumber',normalized_registration,
      'registrationChanged',normalized_registration is distinct from selected_vehicle.registration_number,
      'registrationVerified',new_registration_verified,
      'registrationVerificationMethod',new_registration_verification_method,
      'registrationVerificationReference',new_registration_verification_reference,
      'manufacturer',new_manufacturer,
      'model',new_model,
      'modelYear',new_model_year,
      'assignedRiderId',new_assigned_rider_id,
      'operationalStatus',new_operational_status,
      'safetyStatus',new_safety_status,
      'maxActiveAssignments',new_max_active_assignments,
      'capacityVerified',new_capacity_verified,
      'reason',change_reason
    ))
  );

  return jsonb_build_object('saved',true,'registrationVerified',new_registration_verified);
end;
$$;

revoke all on function public.update_fleet_vehicle_configuration(
  uuid,uuid,text,boolean,text,text,text,text,integer,uuid,text,text,integer,
  integer,integer,integer,integer,boolean,text
) from public,anon,authenticated;
grant execute on function public.update_fleet_vehicle_configuration(
  uuid,uuid,text,boolean,text,text,text,text,integer,uuid,text,text,integer,
  integer,integer,integer,integer,boolean,text
) to service_role;

-- Existing test or unverified registrations must fail closed without deleting any
-- fleet record. Bikes carrying active work keep their state, but the resource guard
-- blocks new work until a reviewed registration is recorded.
update public.fleet_vehicles vehicle
set operational_status='offline', updated_at=now()
where vehicle.operational_status in ('available','assigned')
  and vehicle.registration_verified_at is null
  and not exists (
    select 1 from public.delivery_assignments assignment
    where assignment.vehicle_id=vehicle.id and assignment.released_at is null
  )
  and not exists (
    select 1 from public.delivery_runs run
    where run.vehicle_id=vehicle.id and run.status in ('planned','active','paused')
  );

comment on column public.fleet_vehicles.registration_number is
  'Physical plate or registration number entered by staff; not dispatch-ready until separately verified.';
comment on column public.fleet_vehicles.registration_verified_at is
  'Time an authorized staff member verified the plate against the physical motorcycle and recorded evidence.';
comment on column public.fleet_vehicles.registration_verification_reference is
  'Auditable, non-secret reference for the reviewed registration evidence.';
comment on function public.update_fleet_vehicle_configuration(
  uuid,uuid,text,boolean,text,text,text,text,integer,uuid,text,text,integer,
  integer,integer,integer,integer,boolean,text
) is 'Service-role-only atomic fleet update that locks active work and records the authorized audit event in the same transaction.';
