-- A seeded fleet label is not a physical registration number. Placeholder bikes
-- remain editable offline, but cannot provide booking capacity or enter dispatch.

do $$
begin
  if exists (
    select 1
    from public.fleet_vehicles vehicle
    where vehicle.registration_number ~* '^PENDING([- ]|$)'
      and (
        exists (select 1 from public.delivery_assignments assignment where assignment.vehicle_id=vehicle.id and assignment.released_at is null)
        or exists (select 1 from public.delivery_runs run where run.vehicle_id=vehicle.id and run.status in ('planned','active','paused'))
      )
  ) then
    raise exception 'resolve active work before taking a placeholder motorcycle offline';
  end if;
end;
$$;

with changed as (
  update public.fleet_vehicles
  set operational_status='offline',
      assigned_rider_id=null,
      updated_at=now()
  where registration_number ~* '^PENDING([- ]|$)'
    and (operational_status in ('available','assigned') or assigned_rider_id is not null)
  returning id,code,registration_number
)
insert into public.audit_logs(actor_type,action,resource_type,resource_id,metadata)
select
  'system',
  'fleet.placeholder_registration_quarantined',
  'fleet_vehicle',
  id,
  jsonb_build_object(
    'code',code,
    'registrationNumber',registration_number,
    'reason','Temporary registration identifiers cannot provide dispatch capacity.'
  )
from changed;

alter table public.fleet_vehicles
  drop constraint if exists fleet_vehicles_placeholder_not_dispatchable,
  add constraint fleet_vehicles_placeholder_not_dispatchable check (
    registration_number is null
    or registration_number !~* '^PENDING([- ]|$)'
    or (
      operational_status in ('offline','maintenance','suspended')
      and assigned_rider_id is null
    )
  );

comment on constraint fleet_vehicles_placeholder_not_dispatchable on public.fleet_vehicles is
  'PENDING fleet records are administrative placeholders only and cannot be assigned or dispatched.';
