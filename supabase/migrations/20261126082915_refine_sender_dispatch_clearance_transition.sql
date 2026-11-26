-- Require payment when dispatch capacity is first consumed or a new rider is
-- substituted. Do not freeze cancellation, release or other safe unwind paths
-- if a later dispute/refund removes payment clearance from an active order.

create or replace function private.enforce_sender_dispatch_payment_clearance()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  old_dispatch_state boolean := false;
  new_dispatch_state boolean;
  assignment_started boolean;
begin
  new_dispatch_state := new.delivery_status in (
    'assigned',
    'rider_en_route_to_pickup',
    'picked_up',
    'in_transit',
    'arrived_at_destination',
    'awaiting_payment',
    'delivered',
    'delivery_failed'
  );

  if tg_op = 'INSERT' then
    assignment_started := new.rider_id is not null or new_dispatch_state;
  else
    old_dispatch_state := old.delivery_status in (
      'assigned',
      'rider_en_route_to_pickup',
      'picked_up',
      'in_transit',
      'arrived_at_destination',
      'awaiting_payment',
      'delivered',
      'delivery_failed'
    );
    assignment_started := (not old_dispatch_state and new_dispatch_state)
      or (
        new.rider_id is not null
        and new.rider_id is distinct from old.rider_id
      );
  end if;

  if new.payer = 'sender'
    and assignment_started
    and not public.order_has_verified_payment_clearance(new.id)
  then
    raise exception 'sender payment clearance required before assignment';
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_sender_dispatch_payment_clearance()
  from public, anon, authenticated;
