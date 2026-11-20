with selected_rider as (
  select membership.user_id
  from public.staff_memberships membership
  join public.profiles profile on profile.id=membership.user_id
  where membership.staff_role='rider'
    and membership.status='active'
    and profile.role='rider'
    and nullif(trim(profile.full_name),'') is not null
    and not exists(
      select 1 from public.fleet_vehicles vehicle
      where vehicle.assigned_rider_id=membership.user_id
    )
  order by membership.identity_verified_at nulls last, membership.user_id
  limit 1
), selected_vehicle as (
  select vehicle.id
  from public.fleet_vehicles vehicle
  where vehicle.id='20000000-0000-4000-8000-000000000001'
    and vehicle.operational_status='offline'
    and vehicle.safety_status='cleared'
    and vehicle.capacity_verified_at is not null
  limit 1
)
update public.fleet_vehicles vehicle
set operational_status='available',
    assigned_rider_id=selected_rider.user_id,
    capacity_verified_by=(
      select id from public.profiles
      where id='68d11a41-56eb-4115-879e-bb6c6e248a88'
    ),
    updated_at=now()
from selected_rider,selected_vehicle
where vehicle.id=selected_vehicle.id;

insert into public.audit_logs(actor_id,actor_type,action,resource_type,resource_id,metadata)
select
  (select id from auth.users where id='68d11a41-56eb-4115-879e-bb6c6e248a88'),
  'admin',
  'fleet.launch_capacity.approved',
  'fleet_vehicle',
  vehicle.id,
  jsonb_build_object(
    'approvedBy','Dovid Logistics',
    'operationalStatus',vehicle.operational_status,
    'registrationNumber',vehicle.registration_number,
    'maxPayloadWeightGrams',vehicle.max_payload_weight_grams,
    'cargoMillimetres',jsonb_build_array(vehicle.cargo_length_mm,vehicle.cargo_width_mm,vehicle.cargo_height_mm),
    'note','Founder authorized standard box capacity and deferred only real plate/detail editing.'
  )
from public.fleet_vehicles vehicle
where vehicle.id='20000000-0000-4000-8000-000000000001'
  and vehicle.operational_status='available';
