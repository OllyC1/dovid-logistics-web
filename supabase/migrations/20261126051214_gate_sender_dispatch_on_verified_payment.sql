-- A sender-paid order must have immutable, verified payment evidence before it
-- can consume fleet capacity. Receiver-pay orders may be dispatched before the
-- receiver pays, but the existing handover guard still prevents completion
-- until every mandatory payment is verified.

create or replace function private.enforce_sender_dispatch_payment_clearance()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  dispatch_started boolean;
begin
  dispatch_started := new.rider_id is not null
    or new.delivery_status in (
      'assigned',
      'rider_en_route_to_pickup',
      'picked_up',
      'in_transit',
      'arrived_at_destination',
      'awaiting_payment',
      'delivered',
      'delivery_failed'
    );

  if new.payer = 'sender'
    and dispatch_started
    and not public.order_has_verified_payment_clearance(new.id)
  then
    raise exception 'sender payment clearance required before assignment';
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_sender_dispatch_payment_clearance()
  from public, anon, authenticated;

drop trigger if exists sender_dispatch_clearance_on_insert on public.delivery_orders;
create trigger sender_dispatch_clearance_on_insert
before insert on public.delivery_orders
for each row execute function private.enforce_sender_dispatch_payment_clearance();

drop trigger if exists sender_dispatch_clearance_on_update on public.delivery_orders;
create trigger sender_dispatch_clearance_on_update
before update of rider_id, delivery_status on public.delivery_orders
for each row execute function private.enforce_sender_dispatch_payment_clearance();

create or replace function public.auto_assign_delivery_order(target_order_id uuid)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
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

  -- Returning null is deliberate. Booking creation must succeed while the
  -- sender is still completing hosted checkout, without notifying a rider or
  -- consuming vehicle capacity.
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
    and v.registration_number is not null
    and v.registration_number !~* '^PENDING([- ]|$)'
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

revoke all on function public.auto_assign_delivery_order(uuid)
  from public, anon, authenticated;
grant execute on function public.auto_assign_delivery_order(uuid) to service_role;

create or replace function private.auto_assign_sender_order_after_payment()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if old.payment_status is distinct from 'paid'
    and new.payment_status = 'paid'
    and new.payer = 'sender'
    and new.delivery_status = 'awaiting_assignment'
  then
    begin
      perform public.auto_assign_delivery_order(new.id);
    exception when others then
      -- A verified payment must remain recorded even if dispatch has a
      -- separate operational problem. Keep an audit record for staff follow-up.
      begin
        insert into public.audit_logs(
          actor_type, action, resource_type, resource_id, metadata
        ) values (
          'system',
          'dispatch.auto_assignment_failed_after_payment',
          'delivery_order',
          new.id,
          jsonb_build_object(
            'sqlstate', sqlstate,
            'error', left(sqlerrm, 500)
          )
        );
      exception when others then
        null;
      end;
    end;
  end if;

  return new;
end;
$$;

revoke all on function private.auto_assign_sender_order_after_payment()
  from public, anon, authenticated;

drop trigger if exists sender_auto_assignment_after_payment on public.delivery_orders;
create trigger sender_auto_assignment_after_payment
after update of payment_status on public.delivery_orders
for each row execute function private.auto_assign_sender_order_after_payment();
