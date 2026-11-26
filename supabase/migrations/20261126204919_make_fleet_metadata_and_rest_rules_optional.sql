-- Founder decision: company-owned motorcycle plate/details and rider timing
-- guidance are useful records, but are not prerequisites for dispatch. Keep the
-- controls that determine real operating capacity: an active named rider,
-- safety clearance, measured capacity, parcel limits and concurrency locks.

alter table public.fleet_vehicles
  drop constraint if exists fleet_vehicles_registration_verification_evidence,
  add constraint fleet_vehicles_registration_verification_evidence
    check (
      registration_verified_at is null
      or registration_verified_by is not null
    );

create or replace function private.enforce_fleet_vehicle_readiness()
returns trigger
language plpgsql
set search_path=''
as $$
begin
  new.registration_number := nullif(
    upper(trim(regexp_replace(new.registration_number, '\s+', ' ', 'g'))),
    ''
  );

  -- Optional evidence is still tied to the plate that was reviewed.
  if tg_op = 'UPDATE'
    and new.registration_number is distinct from old.registration_number
    and new.registration_verified_at is not null
    and new.registration_verified_at is not distinct from old.registration_verified_at then
    new.registration_verified_at := null;
    new.registration_verified_by := null;
    new.registration_verification_method := null;
    new.registration_verification_reference := null;
  end if;

  if new.registration_verified_at > now() + interval '1 minute' then
    raise exception 'registration verification time cannot be in the future';
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
    or vehicle_record.safety_status <> 'cleared'
    or vehicle_record.capacity_verified_at is null
    or vehicle_record.assigned_rider_id is distinct from target_rider then
    raise exception 'a safety-cleared, capacity-verified bike assigned to this rider is required';
  end if;

  return new;
end;
$$;

create or replace function private.enforce_delivery_run_safety()
returns trigger
language plpgsql
set search_path=''
as $$
declare
  maximum_riding_minutes integer;
  minimum_break_minutes integer;
  route_duration_seconds integer;
begin
  select
    settings.maximum_continuous_riding_minutes,
    settings.minimum_break_minutes
  into maximum_riding_minutes,minimum_break_minutes
  from public.delivery_orders delivery_order
  left join public.service_zones pickup_zone on pickup_zone.id=delivery_order.pickup_zone_id
  left join public.service_area_operational_settings settings on settings.service_area_id=pickup_zone.service_area_id
  where delivery_order.id=new.order_id;

  begin
    route_duration_seconds:=nullif(new.route_snapshot->>'durationSeconds','')::integer;
  exception when invalid_text_representation then
    raise exception 'verified run route duration is required';
  end;
  if route_duration_seconds is null or route_duration_seconds<=0 then
    raise exception 'verified run route duration is required';
  end if;
  if maximum_riding_minutes is not null
    and route_duration_seconds>maximum_riding_minutes*60 then
    raise exception 'delivery run exceeds maximum continuous riding time (% seconds over % minutes)',
      route_duration_seconds,maximum_riding_minutes;
  end if;

  new.route_snapshot:=new.route_snapshot||jsonb_strip_nulls(jsonb_build_object(
    'maximumContinuousRidingMinutes',maximum_riding_minutes,
    'minimumBreakMinutes',minimum_break_minutes
  ));
  return new;
end;
$$;

revoke all on function private.enforce_fleet_vehicle_readiness() from public,anon,authenticated;
revoke all on function private.enforce_dispatch_resource_readiness() from public,anon,authenticated;
revoke all on function private.enforce_delivery_run_safety() from public,anon,authenticated;

create or replace function public.assign_delivery_order(
  target_order_id uuid,
  target_vehicle_id uuid,
  target_rider_id uuid,
  actor_id uuid,
  score_snapshot jsonb,
  override_reason text default null
) returns uuid
language plpgsql
security definer
set search_path=public,private,pg_catalog
as $$
declare selected_vehicle public.fleet_vehicles%rowtype;
declare selected_order public.delivery_orders%rowtype;
declare assignment_id uuid;
declare rider_capacity integer;
declare effective_capacity integer;
declare vehicle_workload integer;
declare rider_workload integer;
begin
  if not exists(select 1 from public.profiles p join public.staff_memberships m on m.user_id=p.id and m.status='active' and m.staff_role in ('admin','super_admin') where p.id=actor_id and p.role='admin') then raise exception 'active admin authorization required'; end if;
  if not exists(select 1 from public.profiles p join public.staff_memberships m on m.user_id=p.id and m.status='active' and m.staff_role='rider' where p.id=target_rider_id and p.role='rider') then raise exception 'active rider profile required'; end if;
  select * into selected_order from public.delivery_orders where id=target_order_id for update;
  if not found then raise exception 'delivery order not found'; end if;
  if selected_order.delivery_status<>'awaiting_assignment' then raise exception 'order is not awaiting assignment'; end if;
  select * into selected_vehicle from public.fleet_vehicles where id=target_vehicle_id for update;
  if not found
    or selected_vehicle.operational_status not in ('available','assigned')
    or selected_vehicle.safety_status<>'cleared'
    or selected_vehicle.capacity_verified_at is null
  then raise exception 'vehicle is not safely available'; end if;
  select coalesce(max_active_assignments_per_rider,1) into rider_capacity
  from public.service_area_operational_settings
  where service_area_id=(select service_area_id from public.service_zones where id=selected_order.pickup_zone_id);
  effective_capacity:=least(selected_vehicle.max_active_assignments,coalesce(rider_capacity,1));
  select count(*) into vehicle_workload from public.delivery_assignments where vehicle_id=target_vehicle_id and released_at is null;
  select count(*) into rider_workload from public.delivery_assignments where rider_id=target_rider_id and released_at is null;
  if vehicle_workload>=effective_capacity then raise exception 'vehicle parcel-count capacity exceeded (% active of %)',vehicle_workload,effective_capacity; end if;
  if rider_workload>=coalesce(rider_capacity,1) then raise exception 'rider capacity conflict (% active of %)',rider_workload,coalesce(rider_capacity,1); end if;
  if selected_vehicle.assigned_rider_id is distinct from target_rider_id and length(trim(coalesce(override_reason,'')))<8 then raise exception 'administrator override reason required'; end if;
  insert into public.delivery_assignments(order_id,vehicle_id,rider_id,assigned_by,score_snapshot,administrator_override,override_reason)
  values(target_order_id,target_vehicle_id,target_rider_id,actor_id,
    coalesce(score_snapshot,'{}'::jsonb)||jsonb_build_object('vehicleWorkloadBefore',vehicle_workload,'riderWorkloadBefore',rider_workload,'effectiveCapacity',effective_capacity),
    selected_vehicle.assigned_rider_id is distinct from target_rider_id,override_reason)
  returning id into assignment_id;
  update public.delivery_orders set rider_id=target_rider_id,delivery_status='assigned',updated_at=now() where id=target_order_id;
  update public.fleet_vehicles set operational_status='assigned',updated_at=now() where id=target_vehicle_id;
  insert into public.delivery_status_events(order_id,previous_status,new_status,actor_id,actor_type,metadata)
  values(target_order_id,'awaiting_assignment','assigned',actor_id,'admin',jsonb_build_object('assignmentId',assignment_id,'vehicleId',target_vehicle_id,'overrideReason',override_reason));
  return assignment_id;
end;
$$;

create or replace function public.auto_assign_delivery_order(target_order_id uuid)
returns uuid
language plpgsql
security definer
set search_path=public,private,pg_catalog
as $$
declare
  actor_id uuid;
  selected_vehicle public.fleet_vehicles%rowtype;
  assignment_id uuid;
  selected_order public.delivery_orders%rowtype;
begin
  select * into selected_order
  from public.delivery_orders
  where id = target_order_id
  for update;

  if not found or selected_order.delivery_status <> 'awaiting_assignment' then
    return null;
  end if;

  if selected_order.payer = 'sender'
    and not public.order_has_verified_payment_clearance(selected_order.id)
  then
    return null;
  end if;

  select p.id into actor_id
  from public.profiles p
  join public.staff_memberships m
    on m.user_id = p.id
   and m.status = 'active'
   and m.staff_role in ('admin', 'super_admin')
  where p.role = 'admin'
  order by p.created_at
  limit 1;

  if actor_id is null then
    return null;
  end if;

  select v.* into selected_vehicle
  from public.fleet_vehicles v
  join public.staff_memberships rider_membership
    on rider_membership.user_id = v.assigned_rider_id
   and rider_membership.staff_role = 'rider'
   and rider_membership.status = 'active'
  join public.profiles rider_profile
    on rider_profile.id = v.assigned_rider_id
   and rider_profile.role = 'rider'
  left join lateral (
    select count(*)::integer as workload
    from public.delivery_assignments active
    where active.vehicle_id = v.id
      and active.released_at is null
  ) load on true
  left join lateral (
    select count(*)::integer as workload
    from public.delivery_assignments active
    where active.rider_id = v.assigned_rider_id
      and active.released_at is null
  ) rider_load on true
  where v.operational_status in ('available', 'assigned')
    and v.safety_status = 'cleared'
    and v.capacity_verified_at is not null
    and coalesce(load.workload, 0) < least(
      v.max_active_assignments,
      coalesce((
        select max_active_assignments_per_rider
        from public.service_area_operational_settings settings
        where settings.service_area_id = (
          select service_area_id
          from public.service_zones
          where id = selected_order.pickup_zone_id
        )
      ), 1)
    )
    and coalesce(rider_load.workload, 0) < coalesce((
      select max_active_assignments_per_rider
      from public.service_area_operational_settings settings
      where settings.service_area_id = (
        select service_area_id
        from public.service_zones
        where id = selected_order.pickup_zone_id
      )
    ), 1)
  order by greatest(coalesce(load.workload, 0), coalesce(rider_load.workload, 0)), v.created_at
  for update of v skip locked
  limit 1;

  if selected_vehicle.id is null then
    insert into public.notifications(
      customer_id, order_id, channel, event_type, title, body,
      deduplication_key, status, next_attempt_at
    )
    select
      p.id,
      selected_order.id,
      'in_app',
      'dispatch_assignment_needed',
      'Rider assignment needed',
      'A new delivery is waiting for rider assignment: ' || selected_order.order_reference,
      'dispatch-assignment-needed:' || selected_order.id || ':' || p.id,
      'queued',
      now()
    from public.profiles p
    where p.role = 'admin'
    on conflict(deduplication_key) do nothing;

    return null;
  end if;

  assignment_id := public.assign_delivery_order(
    selected_order.id,
    selected_vehicle.id,
    selected_vehicle.assigned_rider_id,
    actor_id,
    jsonb_build_object('source', 'automatic', 'vehicleId', selected_vehicle.id),
    null
  );

  insert into public.notifications(
    customer_id, order_id, channel, event_type, title, body,
    deduplication_key, status, next_attempt_at
  ) values (
    selected_vehicle.assigned_rider_id,
    selected_order.id,
    'in_app',
    'rider_assignment',
    'New delivery assigned',
    'Delivery ' || selected_order.order_reference || ' is assigned to you. Pickup: ' ||
      selected_order.pickup_address || '. Payment status: ' || selected_order.payment_status || '.',
    'rider-assignment:' || selected_order.id,
    'queued',
    now()
  )
  on conflict(deduplication_key) do nothing;

  return assignment_id;
end;
$$;

create or replace function public.create_delivery_run(
  target_vehicle_id uuid,
  target_rider_id uuid,
  actor_id uuid,
  target_start_at timestamptz,
  compliance_reason text,
  request_idempotency_key uuid
) returns uuid
language plpgsql
security definer
set search_path=public,private,pg_catalog
as $$
declare
  selected_vehicle public.fleet_vehicles%rowtype;
  created_run_id uuid;
begin
  if not exists(
    select 1
    from public.profiles profile
    join public.staff_memberships membership on membership.user_id=profile.id
    where profile.id=actor_id
      and profile.role='admin'
      and membership.staff_role in ('admin','super_admin')
      and membership.status='active'
  ) then
    raise exception 'active admin authorization required';
  end if;
  if not exists(
    select 1
    from public.profiles profile
    join public.staff_memberships membership on membership.user_id=profile.id
    where profile.id=target_rider_id
      and profile.role='rider'
      and membership.staff_role='rider'
      and membership.status='active'
      and nullif(trim(profile.full_name),'') is not null
  ) then
    raise exception 'active named rider required';
  end if;
  if length(trim(compliance_reason))<8 then
    raise exception 'dispatch compliance confirmation is required';
  end if;

  select id into created_run_id
  from public.delivery_runs
  where idempotency_key=request_idempotency_key;
  if found then
    return created_run_id;
  end if;

  select * into selected_vehicle
  from public.fleet_vehicles
  where id=target_vehicle_id
  for update;
  if not found
    or selected_vehicle.operational_status<>'available'
    or selected_vehicle.safety_status<>'cleared'
    or selected_vehicle.capacity_verified_at is null
  then
    raise exception 'vehicle is not safely available';
  end if;
  if selected_vehicle.assigned_rider_id is distinct from target_rider_id then
    raise exception 'vehicle is not assigned to this rider';
  end if;
  if exists(
    select 1
    from public.delivery_assignments assignment
    where assignment.released_at is null
      and (assignment.vehicle_id=target_vehicle_id or assignment.rider_id=target_rider_id)
  ) then
    raise exception 'rider or vehicle has active delivery assignments';
  end if;
  if exists(
    select 1
    from public.delivery_runs run
    where (run.vehicle_id=target_vehicle_id or run.rider_id=target_rider_id)
      and run.status in ('planned','active','paused')
  ) then
    raise exception 'rider or vehicle already has an active run';
  end if;

  insert into public.delivery_runs(
    run_reference,rider_id,vehicle_id,scheduled_start_at,
    compliance_confirmed_at,compliance_confirmed_by,compliance_notes,
    idempotency_key,created_by
  ) values (
    'RUN-'||to_char(now(),'YYMMDD')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,8)),
    target_rider_id,target_vehicle_id,target_start_at,
    now(),actor_id,compliance_reason,request_idempotency_key,actor_id
  ) returning id into created_run_id;

  return created_run_id;
end;
$$;

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

  normalized_registration := nullif(
    upper(trim(regexp_replace(new_registration_number, '\s+', ' ', 'g'))),
    ''
  );
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

-- Restore only motorcycles whose latest explicit administrative fleet action
-- marked them available, and which still meet rider, safety and capacity gates.
-- This reverses the automatic offline action from the preceding migration
-- without activating maintenance, suspended or otherwise unapproved records.
with candidates as (
  select
    vehicle.id,
    (
      select log.actor_id
      from public.audit_logs log
      where log.resource_type='fleet_vehicle'
        and log.resource_id=vehicle.id
        and log.action='fleet.vehicle.updated'
      order by log.created_at desc
      limit 1
    ) as actor_id,
    (
      select log.metadata->>'operationalStatus'
      from public.audit_logs log
      where log.resource_type='fleet_vehicle'
        and log.resource_id=vehicle.id
        and log.action='fleet.vehicle.updated'
      order by log.created_at desc
      limit 1
    ) as last_approved_status
  from public.fleet_vehicles vehicle
  where vehicle.operational_status='offline'
    and vehicle.assigned_rider_id is not null
    and vehicle.safety_status='cleared'
    and vehicle.capacity_verified_at is not null
    and vehicle.max_payload_weight_grams is not null
    and vehicle.cargo_length_mm is not null
    and vehicle.cargo_width_mm is not null
    and vehicle.cargo_height_mm is not null
    and not exists (
      select 1 from public.delivery_assignments assignment
      where assignment.vehicle_id=vehicle.id and assignment.released_at is null
    )
    and not exists (
      select 1 from public.delivery_runs run
      where run.vehicle_id=vehicle.id and run.status in ('planned','active','paused')
    )
), restored as (
  update public.fleet_vehicles vehicle
  set operational_status='available', updated_at=now()
  from candidates candidate
  where vehicle.id=candidate.id
    and candidate.last_approved_status='available'
  returning vehicle.id, candidate.actor_id
)
insert into public.audit_logs(
  actor_id,actor_type,action,resource_type,resource_id,metadata
)
select
  restored.actor_id,
  'system',
  'fleet.optional_metadata_readiness_restored',
  'fleet_vehicle',
  restored.id,
  jsonb_build_object(
    'operationalStatus','available',
    'reason','Restored the latest administrator-approved availability after optional metadata policy update.'
  )
from restored;

comment on column public.fleet_vehicles.registration_number is
  'Optional physical plate or registration number for company fleet records; dispatch readiness is controlled by rider, safety and measured capacity.';
comment on column public.fleet_vehicles.registration_verified_at is
  'Optional time an authorized staff member recorded a company registration review; not a dispatch prerequisite.';
comment on function public.update_fleet_vehicle_configuration(
  uuid,uuid,text,boolean,text,text,text,text,integer,uuid,text,text,integer,
  integer,integer,integer,integer,boolean,text
) is 'Service-role-only atomic fleet update. Plate, description and registration notes are optional; rider, safety and measured capacity remain dispatch gates.';
