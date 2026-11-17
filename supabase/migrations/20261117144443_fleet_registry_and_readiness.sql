-- Fleet registry and dispatch-readiness hardening.
-- Existing placeholder motorcycles remain offline and require a real plate number
-- and verified readiness evidence before they can become available.

alter table public.fleet_vehicles
  alter column id set default gen_random_uuid(),
  add column if not exists registration_number text,
  add column if not exists manufacturer text,
  add column if not exists model text,
  add column if not exists model_year integer,
  add column if not exists created_by uuid references public.profiles(id) on delete restrict;

alter table public.fleet_vehicles
  drop constraint if exists fleet_vehicles_registration_number_format,
  add constraint fleet_vehicles_registration_number_format
    check (
      registration_number is null or
      (length(registration_number) between 3 and 20 and registration_number ~ '^[A-Z0-9 -]+$')
    ),
  drop constraint if exists fleet_vehicles_model_year_range,
  add constraint fleet_vehicles_model_year_range
    check (model_year is null or model_year between 1980 and 2100);

create unique index if not exists fleet_vehicles_registration_number_unique_idx
  on public.fleet_vehicles (registration_number)
  where registration_number is not null;

create unique index if not exists fleet_vehicles_assigned_rider_unique_idx
  on public.fleet_vehicles (assigned_rider_id)
  where assigned_rider_id is not null;

create or replace function private.enforce_fleet_vehicle_readiness()
returns trigger
language plpgsql
set search_path=''
as $$
begin
  if new.registration_number is not null then
    new.registration_number := upper(trim(regexp_replace(new.registration_number, '\s+', ' ', 'g')));
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
    if new.registration_number is null then
      raise exception 'record the motorcycle plate number before activation';
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

drop trigger if exists fleet_vehicle_readiness_guard on public.fleet_vehicles;
create trigger fleet_vehicle_readiness_guard
before insert or update on public.fleet_vehicles
for each row execute function private.enforce_fleet_vehicle_readiness();

revoke all on function private.enforce_fleet_vehicle_readiness() from public,anon,authenticated;

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
  if not found or vehicle_record.registration_number is null
    or vehicle_record.safety_status <> 'cleared'
    or vehicle_record.capacity_verified_at is null
    or vehicle_record.assigned_rider_id is distinct from target_rider then
    raise exception 'a registered, verified bike assigned to this rider is required';
  end if;

  return new;
end;
$$;

drop trigger if exists delivery_run_resource_readiness_guard on public.delivery_runs;
create trigger delivery_run_resource_readiness_guard
before insert or update of rider_id,vehicle_id,status on public.delivery_runs
for each row execute function private.enforce_dispatch_resource_readiness();

drop trigger if exists delivery_assignment_resource_readiness_guard on public.delivery_assignments;
create trigger delivery_assignment_resource_readiness_guard
before insert or update of rider_id,vehicle_id,released_at on public.delivery_assignments
for each row execute function private.enforce_dispatch_resource_readiness();

revoke all on function private.enforce_dispatch_resource_readiness() from public,anon,authenticated;

comment on column public.fleet_vehicles.registration_number is
  'Founder-verified physical plate or registration number; unique after normalization.';
comment on column public.fleet_vehicles.code is
  'Human-friendly internal fleet label. The registration number is the physical motorcycle identifier.';
