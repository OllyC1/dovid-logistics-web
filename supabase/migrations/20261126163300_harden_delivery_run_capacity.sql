-- Enforce rider and motorcycle capacity at the shared assignment boundary so
-- direct dispatch, automatic dispatch and multi-parcel runs cannot diverge.

create or replace function private.enforce_delivery_assignment_capacity()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  selected_vehicle public.fleet_vehicles%rowtype;
  rider_capacity integer;
  vehicle_workload integer;
  rider_workload integer;
begin
  if new.released_at is not null then
    return new;
  end if;

  select * into selected_vehicle
  from public.fleet_vehicles
  where id=new.vehicle_id
  for update;
  if not found then
    raise exception 'delivery assignment vehicle not found';
  end if;

  select coalesce(settings.max_active_assignments_per_rider,1)
  into rider_capacity
  from public.delivery_orders delivery_order
  left join public.service_zones pickup_zone on pickup_zone.id=delivery_order.pickup_zone_id
  left join public.service_area_operational_settings settings on settings.service_area_id=pickup_zone.service_area_id
  where delivery_order.id=new.order_id;
  if not found then
    raise exception 'delivery assignment order not found';
  end if;
  rider_capacity:=coalesce(rider_capacity,1);

  select count(*) into vehicle_workload
  from public.delivery_assignments assignment
  where assignment.vehicle_id=new.vehicle_id
    and assignment.released_at is null
    and assignment.id is distinct from new.id;

  select count(*) into rider_workload
  from public.delivery_assignments assignment
  where assignment.rider_id=new.rider_id
    and assignment.released_at is null
    and assignment.id is distinct from new.id;

  if vehicle_workload>=selected_vehicle.max_active_assignments then
    raise exception 'vehicle parcel-count capacity exceeded (% active of %)',
      vehicle_workload,selected_vehicle.max_active_assignments;
  end if;
  if rider_workload>=rider_capacity then
    raise exception 'rider parcel-count capacity exceeded (% active of %)',
      rider_workload,rider_capacity;
  end if;

  return new;
end;
$$;

drop trigger if exists delivery_assignment_capacity_guard on public.delivery_assignments;
create trigger delivery_assignment_capacity_guard
before insert or update of vehicle_id,rider_id,released_at on public.delivery_assignments
for each row execute function private.enforce_delivery_assignment_capacity();

revoke all on function private.enforce_delivery_assignment_capacity()
from public,anon,authenticated,service_role;

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
    or selected_vehicle.registration_number is null
    or selected_vehicle.registration_number ~* '^PENDING([- ]|$)'
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

revoke all on function public.create_delivery_run(uuid,uuid,uuid,timestamptz,text,uuid)
from public,anon,authenticated;
grant execute on function public.create_delivery_run(uuid,uuid,uuid,timestamptz,text,uuid)
to service_role;

comment on function private.enforce_delivery_assignment_capacity() is
  'Serializes assignment against its motorcycle and enforces both motorcycle and configured rider parcel limits across every active assignment path.';
