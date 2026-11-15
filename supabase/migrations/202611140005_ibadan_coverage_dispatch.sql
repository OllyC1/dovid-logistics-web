-- Ibadan coverage planning and two-bike dispatch controls.
-- No zone geometry is seeded or activated by this migration.

create or replace function public.is_valid_zone_geojson(input jsonb) returns boolean
language sql immutable set search_path=public as $$
  with geometry as (
    select case
      when input->>'type'='Feature' then input->'geometry'
      else input
    end as value
  )
  select coalesce(
    (value->>'type' in ('Polygon','MultiPolygon'))
    and jsonb_typeof(value->'coordinates')='array'
    and jsonb_array_length(value->'coordinates')>0,
    false
  )
  from geometry;
$$;

alter table public.service_zones alter column boundary_geojson drop not null;
alter table public.service_zones drop constraint if exists service_zones_boundary_geojson_check;
alter table public.service_zones
  add column code text,
  add column operational_status text not null default 'draft'
    check (operational_status in ('draft','in_review','approved','active','suspended')),
  add column booking_eligibility text not null default 'unavailable'
    check (booking_eligibility in ('standard','manual_approval','unavailable')),
  add column dispatch_approval_required boolean not null default true,
  add column priority integer not null default 100,
  add column effective_from timestamptz not null default now(),
  add column effective_until timestamptz,
  add column boundary_source text,
  add column review_notes text,
  add column approved_by uuid references public.profiles(id) on delete restrict,
  add column approved_at timestamptz,
  add column approval_boundary_hash text,
  add column updated_at timestamptz not null default now(),
  add constraint service_zones_boundary_valid_check
    check (boundary_geojson is null or public.is_valid_zone_geojson(boundary_geojson)),
  add constraint service_zones_effective_dates_check
    check (effective_until is null or effective_until > effective_from);

create unique index service_zones_area_code_idx
  on public.service_zones(service_area_id,code) where code is not null;
create index service_zones_operational_idx
  on public.service_zones(service_area_id,operational_status,priority);

create table public.service_zone_change_history (
  id uuid primary key default gen_random_uuid(),
  zone_id uuid not null references public.service_zones(id) on delete cascade,
  action text not null,
  boundary_geojson jsonb,
  settings_snapshot jsonb not null,
  changed_by uuid references public.profiles(id) on delete set null,
  change_reason text,
  created_at timestamptz not null default now()
);
create index service_zone_history_zone_created_idx
  on public.service_zone_change_history(zone_id,created_at desc);

create or replace function public.prepare_service_zone_change() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if new.boundary_geojson is distinct from old.boundary_geojson then
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
language plpgsql security definer set search_path=public as $$
declare actor uuid;
begin
  actor := nullif(current_setting('app.actor_id',true),'')::uuid;
  insert into public.service_zone_change_history(zone_id,action,boundary_geojson,settings_snapshot,changed_by)
  values(
    new.id,
    case when tg_op='INSERT' then 'created' else 'updated' end,
    new.boundary_geojson,
    to_jsonb(new)-'boundary_geojson',
    actor
  );
  return new;
end;
$$;
create trigger service_zone_prepare_change_trigger
before update on public.service_zones
for each row execute function public.prepare_service_zone_change();
create trigger service_zone_change_history_trigger
after insert or update on public.service_zones
for each row execute function public.capture_service_zone_change();

create table public.service_area_operational_settings (
  service_area_id uuid primary key references public.service_areas(id) on delete cascade,
  standard_max_distance_meters integer not null default 12000 check (standard_max_distance_meters > 0),
  manual_max_distance_meters integer not null default 22000 check (manual_max_distance_meters > standard_max_distance_meters),
  service_hours jsonb not null default '{"timezone":"Africa/Lagos","monday":["07:00","20:00"],"tuesday":["07:00","20:00"],"wednesday":["07:00","20:00"],"thursday":["07:00","20:00"],"friday":["07:00","20:00"],"saturday":["08:00","18:00"],"sunday":null}'::jsonb,
  fleet_size integer not null default 2 check (fleet_size between 1 and 100),
  max_active_assignments_per_rider integer not null default 1 check (max_active_assignments_per_rider between 1 and 10),
  standard_package_sizes jsonb not null default '["small","medium"]'::jsonb,
  oversized_requires_manual_approval boolean not null default true,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table public.delivery_availability_requests (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.profiles(id) on delete set null,
  service_area_id uuid references public.service_areas(id) on delete restrict,
  pickup_zone_id uuid references public.service_zones(id) on delete restrict,
  delivery_zone_id uuid references public.service_zones(id) on delete restrict,
  request_payload jsonb not null,
  road_distance_meters integer check (road_distance_meters is null or road_distance_meters >= 0),
  estimated_duration_seconds integer check (estimated_duration_seconds is null or estimated_duration_seconds >= 0),
  decision text not null check (decision in ('manual_approval','manual_quote','unsupported','capacity_unavailable')),
  reason_code text not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected','expired')),
  pricing_snapshot jsonb,
  reviewed_by uuid references public.profiles(id) on delete restrict,
  reviewed_at timestamptz,
  review_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index delivery_availability_requests_status_idx
  on public.delivery_availability_requests(status,created_at);

create table public.fleet_vehicles (
  id uuid primary key,
  code text not null unique,
  vehicle_type text not null default 'motorcycle' check (vehicle_type='motorcycle'),
  operational_status text not null default 'offline'
    check (operational_status in ('offline','available','assigned','maintenance','suspended')),
  assigned_rider_id uuid references public.profiles(id) on delete set null,
  home_territory_codes text[] not null default '{}',
  max_active_assignments integer not null default 1 check (max_active_assignments between 1 and 5),
  current_latitude numeric(10,7),
  current_longitude numeric(10,7),
  location_recorded_at timestamptz,
  safety_status text not null default 'cleared' check (safety_status in ('cleared','review_required','blocked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.delivery_assignments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.delivery_orders(id) on delete restrict,
  vehicle_id uuid not null references public.fleet_vehicles(id) on delete restrict,
  rider_id uuid not null references public.profiles(id) on delete restrict,
  assigned_by uuid not null references public.profiles(id) on delete restrict,
  score_snapshot jsonb not null,
  administrator_override boolean not null default false,
  override_reason text,
  assigned_at timestamptz not null default now(),
  released_at timestamptz,
  release_reason text,
  check (not administrator_override or length(trim(override_reason)) >= 8)
);
create unique index delivery_assignments_active_order_idx
  on public.delivery_assignments(order_id) where released_at is null;
create unique index delivery_assignments_active_vehicle_idx
  on public.delivery_assignments(vehicle_id) where released_at is null;
create index delivery_assignments_active_rider_idx
  on public.delivery_assignments(rider_id,assigned_at) where released_at is null;

alter table public.quotes
  add column operational_approval_status text not null default 'not_required'
    check (operational_approval_status in ('not_required','pending','approved','rejected')),
  add column availability_request_id uuid references public.delivery_availability_requests(id) on delete restrict;

alter table public.delivery_orders
  add column pickup_zone_id uuid references public.service_zones(id) on delete restrict,
  add column delivery_zone_id uuid references public.service_zones(id) on delete restrict,
  add column eligibility_decision text,
  add column availability_request_id uuid references public.delivery_availability_requests(id) on delete restrict;
create index delivery_orders_pickup_zone_created_idx on public.delivery_orders(pickup_zone_id,created_at desc);
create index delivery_orders_delivery_zone_created_idx on public.delivery_orders(delivery_zone_id,created_at desc);

create or replace function public.apply_order_operational_context() returns trigger
language plpgsql security definer set search_path=public as $$
declare payload jsonb;
begin
  select request_payload into payload from public.quotes where id=new.quote_id;
  new.pickup_zone_id := nullif(payload->>'pickupZoneId','')::uuid;
  new.delivery_zone_id := nullif(payload->>'deliveryZoneId','')::uuid;
  new.eligibility_decision := payload->>'eligibilityDecision';
  new.availability_request_id := nullif(payload->>'availabilityRequestId','')::uuid;
  return new;
end;
$$;
create trigger delivery_order_operational_context_trigger
before insert on public.delivery_orders
for each row execute function public.apply_order_operational_context();

create or replace function public.review_service_zone(target_zone_id uuid, actor_id uuid, reason text) returns void
language plpgsql security definer set search_path=public,extensions as $$
declare selected_zone public.service_zones%rowtype;
begin
  if not exists(select 1 from public.profiles where id=actor_id and role='admin') then raise exception 'admin authorization required'; end if;
  if length(trim(reason))<8 then raise exception 'review reason required'; end if;
  select * into selected_zone from public.service_zones where id=target_zone_id for update;
  if not found then raise exception 'service zone not found'; end if;
  if not public.is_valid_zone_geojson(selected_zone.boundary_geojson) then raise exception 'valid reviewed polygon required'; end if;
  perform set_config('app.actor_id',actor_id::text,true);
  update public.service_zones
  set operational_status='in_review',active=false,review_notes=reason
  where id=target_zone_id;
end;
$$;

create or replace function public.approve_service_zone(target_zone_id uuid, actor_id uuid, reason text) returns void
language plpgsql security definer set search_path=public,extensions as $$
declare selected_zone public.service_zones%rowtype;
begin
  if not exists(select 1 from public.profiles where id=actor_id and role='admin') then raise exception 'admin authorization required'; end if;
  if length(trim(reason))<8 then raise exception 'approval reason required'; end if;
  lock table public.service_zones in share row exclusive mode;
  select * into selected_zone from public.service_zones where id=target_zone_id for update;
  if not found then raise exception 'service zone not found'; end if;
  if selected_zone.operational_status<>'in_review' then raise exception 'zone must be in review before approval'; end if;
  if not public.is_valid_zone_geojson(selected_zone.boundary_geojson) then raise exception 'valid reviewed polygon required'; end if;
  perform set_config('app.actor_id',actor_id::text,true);
  update public.service_zones
  set operational_status='approved',active=false,approved_by=actor_id,approved_at=now(),
      approval_boundary_hash=encode(extensions.digest(boundary_geojson::text,'sha256'),'hex'),review_notes=reason
  where id=target_zone_id;
end;
$$;

create or replace function public.activate_service_zone(target_zone_id uuid, actor_id uuid, reason text) returns void
language plpgsql security definer set search_path=public,extensions as $$
declare selected_zone public.service_zones%rowtype;
begin
  if not exists(select 1 from public.profiles where id=actor_id and role='admin') then raise exception 'admin authorization required'; end if;
  if length(trim(reason))<8 then raise exception 'activation reason required'; end if;
  select * into selected_zone from public.service_zones where id=target_zone_id for update;
  if not found then raise exception 'service zone not found'; end if;
  if selected_zone.operational_status<>'approved' or selected_zone.approved_by is null then raise exception 'explicit zone approval required'; end if;
  if selected_zone.approval_boundary_hash is distinct from encode(extensions.digest(selected_zone.boundary_geojson::text,'sha256'),'hex') then raise exception 'zone boundary changed after approval'; end if;
  if selected_zone.booking_eligibility='unavailable' then raise exception 'booking eligibility must be reviewed before activation'; end if;
  if selected_zone.effective_from>now() or (selected_zone.effective_until is not null and selected_zone.effective_until<=now()) then raise exception 'zone is outside its effective dates'; end if;
  perform set_config('app.actor_id',actor_id::text,true);
  update public.service_zones set operational_status='active',active=true,review_notes=reason where id=target_zone_id;
end;
$$;

create or replace function public.suspend_service_zone(target_zone_id uuid, actor_id uuid, reason text) returns void
language plpgsql security definer set search_path=public as $$
begin
  if not exists(select 1 from public.profiles where id=actor_id and role='admin') then raise exception 'admin authorization required'; end if;
  if length(trim(reason))<8 then raise exception 'suspension reason required'; end if;
  perform set_config('app.actor_id',actor_id::text,true);
  update public.service_zones set operational_status='suspended',active=false,review_notes=reason where id=target_zone_id;
  if not found then raise exception 'service zone not found'; end if;
end;
$$;

create or replace function public.assign_delivery_order(
  target_order_id uuid,
  target_vehicle_id uuid,
  target_rider_id uuid,
  actor_id uuid,
  score_snapshot jsonb,
  override_reason text default null
) returns uuid
language plpgsql security definer set search_path=public as $$
declare selected_vehicle public.fleet_vehicles%rowtype;
declare selected_order public.delivery_orders%rowtype;
declare assignment_id uuid;
declare rider_capacity integer;
begin
  if not exists(select 1 from public.profiles where id=actor_id and role='admin') then raise exception 'admin authorization required'; end if;
  if not exists(select 1 from public.profiles where id=target_rider_id and role='rider') then raise exception 'active rider profile required'; end if;
  select * into selected_order from public.delivery_orders where id=target_order_id for update;
  if not found then raise exception 'delivery order not found'; end if;
  if selected_order.delivery_status<>'awaiting_assignment' then raise exception 'order is not awaiting assignment'; end if;
  select * into selected_vehicle from public.fleet_vehicles where id=target_vehicle_id for update;
  if not found or selected_vehicle.operational_status<>'available' or selected_vehicle.safety_status<>'cleared' then raise exception 'vehicle is not safely available'; end if;
  if exists(select 1 from public.delivery_assignments where vehicle_id=target_vehicle_id and released_at is null) then raise exception 'vehicle capacity conflict'; end if;
  select coalesce(max_active_assignments_per_rider,1) into rider_capacity
  from public.service_area_operational_settings
  where service_area_id=(select service_area_id from public.service_zones where id=selected_order.pickup_zone_id);
  rider_capacity:=coalesce(rider_capacity,1);
  if (select count(*) from public.delivery_assignments where rider_id=target_rider_id and released_at is null)>=rider_capacity then raise exception 'rider capacity conflict'; end if;
  if selected_vehicle.assigned_rider_id is distinct from target_rider_id and length(trim(coalesce(override_reason,'')))<8 then raise exception 'administrator override reason required'; end if;
  insert into public.delivery_assignments(order_id,vehicle_id,rider_id,assigned_by,score_snapshot,administrator_override,override_reason)
  values(target_order_id,target_vehicle_id,target_rider_id,actor_id,score_snapshot,selected_vehicle.assigned_rider_id is distinct from target_rider_id,override_reason)
  returning id into assignment_id;
  update public.delivery_orders set rider_id=target_rider_id,delivery_status='assigned',updated_at=now() where id=target_order_id;
  update public.fleet_vehicles set operational_status='assigned',updated_at=now() where id=target_vehicle_id;
  insert into public.delivery_status_events(order_id,previous_status,new_status,actor_id,actor_type,metadata)
  values(target_order_id,'awaiting_assignment','assigned',actor_id,'admin',jsonb_build_object('assignmentId',assignment_id,'vehicleId',target_vehicle_id,'overrideReason',override_reason));
  return assignment_id;
end;
$$;

create or replace function public.release_completed_assignment() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if new.delivery_status in ('delivered','delivery_failed','cancelled') and new.delivery_status is distinct from old.delivery_status then
    update public.delivery_assignments
    set released_at=now(),release_reason=new.delivery_status::text
    where order_id=new.id and released_at is null;
    update public.fleet_vehicles
    set operational_status='available',updated_at=now()
    where id in (select vehicle_id from public.delivery_assignments where order_id=new.id);
  end if;
  return new;
end;
$$;
create trigger delivery_assignment_release_trigger
after update of delivery_status on public.delivery_orders
for each row execute function public.release_completed_assignment();

alter table public.service_zone_change_history enable row level security;
alter table public.service_area_operational_settings enable row level security;
alter table public.delivery_availability_requests enable row level security;
alter table public.fleet_vehicles enable row level security;
alter table public.delivery_assignments enable row level security;

create policy admin_service_zones_read on public.service_zones for select to authenticated using (public.has_role('admin'));
create policy admin_zone_history_read on public.service_zone_change_history for select to authenticated using (public.has_role('admin'));
create policy admin_operational_settings_read on public.service_area_operational_settings for select to authenticated using (public.has_role('admin'));
create policy admin_availability_requests_read on public.delivery_availability_requests for select to authenticated using (public.has_role('admin'));
create policy customer_availability_requests_read on public.delivery_availability_requests for select to authenticated using (customer_id=auth.uid());
create policy admin_fleet_read on public.fleet_vehicles for select to authenticated using (public.has_role('admin'));
create policy rider_assigned_vehicle_read on public.fleet_vehicles for select to authenticated using (assigned_rider_id=auth.uid());
create policy admin_assignments_read on public.delivery_assignments for select to authenticated using (public.has_role('admin'));
create policy rider_assignments_read on public.delivery_assignments for select to authenticated using (rider_id=auth.uid());

grant select on public.service_zones,public.service_zone_change_history,public.service_area_operational_settings,
  public.delivery_availability_requests,public.fleet_vehicles,public.delivery_assignments to authenticated;
grant select on public.service_zones to anon;
revoke insert,update,delete on public.service_zones,public.service_zone_change_history,
  public.service_area_operational_settings,public.delivery_availability_requests,
  public.fleet_vehicles,public.delivery_assignments from anon,authenticated;

revoke all on function public.review_service_zone(uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.approve_service_zone(uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.activate_service_zone(uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.suspend_service_zone(uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.assign_delivery_order(uuid,uuid,uuid,uuid,jsonb,text) from public,anon,authenticated;
grant execute on function public.review_service_zone(uuid,uuid,text) to service_role;
grant execute on function public.approve_service_zone(uuid,uuid,text) to service_role;
grant execute on function public.activate_service_zone(uuid,uuid,text) to service_role;
grant execute on function public.suspend_service_zone(uuid,uuid,text) to service_role;
grant execute on function public.assign_delivery_order(uuid,uuid,uuid,uuid,jsonb,text) to service_role;
revoke all on function public.capture_service_zone_change() from public,anon,authenticated;
revoke all on function public.prepare_service_zone_change() from public,anon,authenticated;
revoke all on function public.apply_order_operational_context() from public,anon,authenticated;
revoke all on function public.release_completed_assignment() from public,anon,authenticated;

-- Explicit deny policies document service-only tables and clear ambiguous
-- "RLS enabled without policy" findings without granting client access.
create policy audit_logs_client_deny on public.audit_logs for all to anon,authenticated using (false) with check (false);
create policy business_enquiries_client_deny on public.business_enquiries for all to anon,authenticated using (false) with check (false);
create policy payment_events_client_deny on public.payment_events for all to anon,authenticated using (false) with check (false);
create policy pricing_rules_client_deny on public.pricing_rules for all to anon,authenticated using (false) with check (false);
create policy receiver_tokens_client_deny on public.receiver_payment_tokens for all to anon,authenticated using (false) with check (false);
create policy service_zones_client_write_deny on public.service_zones for insert to anon,authenticated with check (false);
create policy verified_accounts_client_deny on public.verified_payment_accounts for all to anon,authenticated using (false) with check (false);

insert into public.service_areas(id,slug,name,city,state,country_code,currency,active)
values('10000000-0000-4000-8000-000000000001','ibadan','Ibadan','Ibadan','Oyo','NG','NGN',false)
on conflict(slug) do update set name=excluded.name,city=excluded.city,state=excluded.state,updated_at=now();

insert into public.service_zones(
  id,service_area_id,name,code,boundary_geojson,active,operational_status,
  booking_eligibility,dispatch_approval_required,priority,boundary_source,review_notes
) values
  ('10000000-0000-4000-8000-00000000000a','10000000-0000-4000-8000-000000000001','Zone A — Northeast','A',null,false,'draft','unavailable',true,10,null,'Planning cluster: Akobo, Bashorun, Idi-Ape, Agodi and Iwo Road. Polygon not yet reviewed.'),
  ('10000000-0000-4000-8000-00000000000b','10000000-0000-4000-8000-000000000001','Zone B — North/Central','B',null,false,'draft','unavailable',true,20,null,'Planning cluster: Bodija, UI, Sango, Samonda and Mokola. Polygon not yet reviewed.'),
  ('10000000-0000-4000-8000-00000000000c','10000000-0000-4000-8000-000000000001','Zone C — City Centre','C',null,false,'draft','unavailable',true,30,null,'Planning cluster: Dugbe, Jericho, Iyaganku and Oke-Ado. Polygon not yet reviewed.'),
  ('10000000-0000-4000-8000-00000000000d','10000000-0000-4000-8000-000000000001','Zone D — South','D',null,false,'draft','unavailable',true,40,null,'Planning cluster: Ring Road, Challenge, Oluyole Estate and Molete. Polygon not yet reviewed.'),
  ('10000000-0000-4000-8000-00000000000e','10000000-0000-4000-8000-000000000001','Zone E — West','E',null,false,'draft','unavailable',true,50,null,'Planning cluster: Eleyele, Apata and Ologuneru. Polygon not yet reviewed.'),
  ('10000000-0000-4000-8000-00000000000f','10000000-0000-4000-8000-000000000001','Zone F — Outskirts','F',null,false,'draft','unavailable',true,60,null,'Planning cluster: Moniya, Alakia, Egbeda and selected reviewed peripheral districts. Polygon not yet reviewed.')
on conflict(id) do update set name=excluded.name,code=excluded.code,priority=excluded.priority;

insert into public.service_area_operational_settings(service_area_id)
values('10000000-0000-4000-8000-000000000001')
on conflict(service_area_id) do nothing;

insert into public.fleet_vehicles(id,code,operational_status,home_territory_codes,safety_status)
values
  ('20000000-0000-4000-8000-000000000001','IB-BIKE-01','offline',array['A','B'],'cleared'),
  ('20000000-0000-4000-8000-000000000002','IB-BIKE-02','offline',array['C','D'],'cleared')
on conflict(id) do update set home_territory_codes=excluded.home_territory_codes;
