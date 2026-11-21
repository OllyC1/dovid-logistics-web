-- Keep public bookings guest-first and make the post-booking handoff observable.

alter table public.delivery_orders
  add column if not exists receipt_email text;

alter table public.notifications
  alter column customer_id drop not null;

create or replace function private.advance_new_order_to_dispatch()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if new.delivery_status = 'awaiting_confirmation' then
    update public.delivery_orders
    set delivery_status = 'confirmed', updated_at = now()
    where id = new.id;
    insert into public.delivery_status_events(order_id, previous_status, new_status, actor_type, metadata)
    values(new.id, 'awaiting_confirmation', 'confirmed', 'system', jsonb_build_object('source', 'booking_created'));

    update public.delivery_orders
    set delivery_status = 'awaiting_assignment', updated_at = now()
    where id = new.id;
    insert into public.delivery_status_events(order_id, previous_status, new_status, actor_type, metadata)
    values(new.id, 'confirmed', 'awaiting_assignment', 'system', jsonb_build_object('source', 'dispatch_queue'));
  end if;
  return new;
end;
$$;

drop trigger if exists advance_new_order_to_dispatch on public.delivery_orders;
create trigger advance_new_order_to_dispatch
after insert on public.delivery_orders
for each row execute function private.advance_new_order_to_dispatch();

create or replace function private.queue_order_email(
  target_order_id uuid,
  notification_event text,
  notification_title text,
  notification_body text,
  notification_key text,
  notification_priority integer default 50,
  notification_metadata jsonb default '{}'::jsonb
) returns void
language plpgsql
security definer
set search_path = public, auth, private
as $$
declare selected_order public.delivery_orders%rowtype;
declare customer_email text;
declare action_path text;
begin
  select * into selected_order from public.delivery_orders where id = target_order_id;
  if not found then return; end if;
  customer_email := lower(selected_order.receipt_email);
  if customer_email is null and selected_order.customer_id is not null then
    select lower(email) into customer_email from auth.users
    where id = selected_order.customer_id and deleted_at is null;
  end if;
  if customer_email is null then return; end if;
  action_path := case when selected_order.customer_id is null
    then '/track/' || selected_order.tracking_reference
    else coalesce(notification_metadata->>'actionPath', '/account/orders/' || selected_order.id::text)
  end;
  insert into public.notifications(
    customer_id, order_id, channel, event_type, title, subject, body, recipient_email,
    deduplication_key, status, delivery_status, priority, metadata, next_attempt_at
  )
  values(
    selected_order.customer_id, selected_order.id, 'email', notification_event,
    notification_title, notification_title,
    notification_body || ' Track it here: ' || action_path,
    customer_email, notification_key, 'queued', 'queued', notification_priority,
    notification_metadata || jsonb_build_object(
      'orderReference', selected_order.order_reference,
      'trackingReference', selected_order.tracking_reference,
      'pickupAddress', selected_order.pickup_address,
      'deliveryAddress', selected_order.delivery_address,
      'paymentStatus', selected_order.payment_status,
      'amountMinor', selected_order.quoted_amount_minor,
      'currency', selected_order.currency
    ), now()
  )
  on conflict(deduplication_key) do nothing;
end;
$$;

create or replace function public.auto_assign_delivery_order(target_order_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare actor_id uuid;
declare selected_vehicle public.fleet_vehicles%rowtype;
declare assignment_id uuid;
declare selected_order public.delivery_orders%rowtype;
declare rider_name text;
begin
  select * into selected_order from public.delivery_orders where id = target_order_id for update;
  if not found or selected_order.delivery_status <> 'awaiting_assignment' then return null; end if;
  select id into actor_id from public.profiles where role = 'admin' order by created_at limit 1;
  if actor_id is null then return null; end if;
  select v.* into selected_vehicle
  from public.fleet_vehicles v
  where v.operational_status = 'available'
    and v.safety_status = 'cleared'
    and v.assigned_rider_id is not null
    and exists(select 1 from public.profiles p where p.id = v.assigned_rider_id and p.role = 'rider')
    and not exists(select 1 from public.delivery_assignments a where a.vehicle_id = v.id and a.released_at is null)
  order by v.created_at
  for update skip locked
  limit 1;
  if selected_vehicle.id is null then
    insert into public.notifications(customer_id, order_id, channel, event_type, title, body, deduplication_key, status, next_attempt_at)
    select p.id, selected_order.id, 'in_app', 'dispatch_assignment_needed',
      'Rider assignment needed',
      'A new delivery is waiting for rider assignment: ' || selected_order.order_reference,
      'dispatch-assignment-needed:' || selected_order.id || ':' || p.id,
      'queued', now()
    from public.profiles p
    where p.role = 'admin';
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
  select full_name into rider_name from public.profiles where id = selected_vehicle.assigned_rider_id;
  insert into public.notifications(customer_id, order_id, channel, event_type, title, body, deduplication_key, status, next_attempt_at)
  values(
    selected_vehicle.assigned_rider_id, selected_order.id, 'in_app', 'rider_assignment',
    'New delivery assigned',
    'Delivery ' || selected_order.order_reference || ' is assigned to you. Pickup: ' || selected_order.pickup_address ||
      '. Payment status: ' || selected_order.payment_status || '.',
    'rider-assignment:' || selected_order.id, 'queued', now()
  )
  on conflict(deduplication_key) do nothing;
  return assignment_id;
end;
$$;

revoke all on function public.auto_assign_delivery_order(uuid) from public, anon, authenticated;
grant execute on function public.auto_assign_delivery_order(uuid) to service_role;

create or replace function public.issue_rider_receiver_payment_token(
  target_order_id uuid,
  actor_id uuid,
  new_receiver_token_hash text,
  new_expires_at timestamptz
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare selected_order public.delivery_orders%rowtype;
declare created_token_id uuid;
begin
  if new_receiver_token_hash !~ '^[0-9a-f]{64}$' then raise exception 'invalid secure payment token'; end if;
  if new_expires_at <= now() + interval '5 minutes' or new_expires_at > now() + interval '49 hours' then
    raise exception 'receiver payment link expiry is invalid';
  end if;
  select * into selected_order from public.delivery_orders where id = target_order_id for update;
  if not found then raise exception 'delivery order not found'; end if;
  if not exists(
    select 1 from public.profiles where id = actor_id and role = 'admin'
  ) and not exists(
    select 1 from public.delivery_orders where id = target_order_id and rider_id = actor_id
  ) then
    raise exception 'assigned rider or admin authorization required';
  end if;
  if selected_order.payer = 'sender' then raise exception 'sender payment is required'; end if;
  if selected_order.payment_status = 'paid' then raise exception 'delivery is already paid'; end if;
  insert into public.receiver_payment_tokens(order_id, token_hash, expires_at)
  values(selected_order.id, new_receiver_token_hash, new_expires_at)
  returning id into created_token_id;
  update public.receiver_payment_tokens
  set consumed_at = coalesce(consumed_at, now())
  where order_id = selected_order.id and id <> created_token_id and consumed_at is null;
  return created_token_id;
end;
$$;

revoke all on function public.issue_rider_receiver_payment_token(uuid,uuid,text,timestamptz)
  from public, anon, authenticated;
grant execute on function public.issue_rider_receiver_payment_token(uuid,uuid,text,timestamptz)
  to service_role;

-- A payer choice is operational, not a pricing input.
create or replace function public.create_guest_delivery_order(
  booking_payload jsonb,
  guest_quote_token_hash text,
  guest_access_token_hash text,
  guest_access_expires_at timestamptz
) returns jsonb
language plpgsql
security definer
set search_path=public,extensions as $$
declare
  selected_token public.guest_quote_access_tokens%rowtype;
  selected_quote public.quotes%rowtype;
  created_order public.delivery_orders%rowtype;
  order_ref text;
  tracking_ref text;
  booking_idempotency uuid;
begin
  if guest_quote_token_hash !~ '^[0-9a-f]{64}$' or guest_access_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid secure access token';
  end if;
  booking_idempotency := (booking_payload->>'idempotencyKey')::uuid;
  if booking_idempotency is null then raise exception 'booking idempotency key is required'; end if;
  select * into selected_token from public.guest_quote_access_tokens where token_hash = guest_quote_token_hash for update;
  if not found or selected_token.expires_at <= now() then raise exception 'quote link is invalid or expired'; end if;
  if selected_token.consumed_at is not null then
    select * into created_order from public.delivery_orders where quote_id = selected_token.quote_id and guest_booking;
    if not found then raise exception 'confirmed guest order is missing'; end if;
    insert into public.guest_order_access_tokens(order_id, token_hash, expires_at)
    values(created_order.id, guest_access_token_hash, guest_access_expires_at)
    on conflict(order_id) do update set token_hash = excluded.token_hash, expires_at = excluded.expires_at, revoked_at = null, last_used_at = null;
    return jsonb_build_object('order_id', created_order.id, 'order_reference', created_order.order_reference, 'tracking_reference', created_order.tracking_reference, 'payment_status', created_order.payment_status, 'idempotent_replay', true);
  end if;
  if selected_token.quote_id is distinct from (booking_payload->>'quoteId')::uuid then raise exception 'quote token does not match this booking'; end if;
  select * into selected_quote from public.quotes where id = selected_token.quote_id for update;
  if not found or selected_quote.expires_at <= now() then raise exception 'quote is missing or expired'; end if;
  if selected_quote.customer_id is not null or selected_quote.status not in ('created','confirmed') then raise exception 'quote cannot be confirmed'; end if;
  if selected_quote.operational_approval_status not in ('not_required','approved') then raise exception 'dispatch approval is still required'; end if;
  if exists(select 1 from public.delivery_orders where quote_id = selected_quote.id) then raise exception 'confirmed quote has already been used'; end if;
  if selected_quote.request_payload->>'pickupAddress' is distinct from booking_payload->>'pickupAddress'
    or selected_quote.request_payload->'pickupCoordinates' is distinct from booking_payload->'pickupCoordinates'
    or selected_quote.request_payload->>'deliveryAddress' is distinct from booking_payload->>'deliveryAddress'
    or selected_quote.request_payload->'deliveryCoordinates' is distinct from booking_payload->'deliveryCoordinates'
    or selected_quote.request_payload->>'packageSize' is distinct from booking_payload->>'packageSize'
    or selected_quote.request_payload->>'packageCategory' is distinct from booking_payload->>'packageCategory'
    or coalesce(selected_quote.request_payload->'additionalStops','[]'::jsonb) is distinct from coalesce(booking_payload->'additionalStops','[]'::jsonb)
    or coalesce(selected_quote.request_payload->'oversized','false'::jsonb) is distinct from booking_payload->'oversized'
    or selected_quote.request_payload->'declaredValueMinor' is distinct from booking_payload->'declaredValueMinor'
    or selected_quote.request_payload->'scheduledAt' is distinct from booking_payload->'scheduledAt'
    or selected_quote.service_level is distinct from coalesce(booking_payload->>'serviceLevel','standard')
    or selected_quote.payment_method is distinct from booking_payload->>'paymentMethod' then
    raise exception 'booking does not match confirmed quote';
  end if;
  update public.quotes set status = 'confirmed', confirmed_at = coalesce(confirmed_at, now()), confirmation_idempotency_key = booking_idempotency
  where id = selected_quote.id and customer_id is null;
  order_ref := 'DOV-' || to_char(now(),'YYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));
  tracking_ref := 'TRK-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,14));
  insert into public.delivery_orders(
    customer_id, quote_id, pricing_configuration_version_id, pricing_snapshot, order_reference, tracking_reference, idempotency_key,
    pickup_address, pickup_latitude, pickup_longitude, pickup_instructions, delivery_address, delivery_latitude, delivery_longitude,
    delivery_instructions, sender_name, sender_phone, recipient_name, recipient_phone, payer, payment_method, service_level,
    scheduled_at, additional_stops, oversized, distance_meters, quoted_amount_minor, currency, booking_origin, guest_booking
  ) values (
    null, selected_quote.id, selected_quote.pricing_configuration_version_id,
    jsonb_build_object('quoteId', selected_quote.id, 'customerTotalKobo', selected_quote.amount_minor, 'currency', selected_quote.currency, 'includedCharges', selected_quote.customer_breakdown, 'configurationVersionId', selected_quote.pricing_configuration_version_id, 'rateCardId', selected_quote.rate_card_id, 'quoteRequest', selected_quote.request_payload),
    order_ref, tracking_ref, booking_idempotency, booking_payload->>'pickupAddress',
    (booking_payload#>>'{pickupCoordinates,latitude}')::numeric, (booking_payload#>>'{pickupCoordinates,longitude}')::numeric,
    booking_payload->>'pickupInstructions', booking_payload->>'deliveryAddress',
    (booking_payload#>>'{deliveryCoordinates,latitude}')::numeric, (booking_payload#>>'{deliveryCoordinates,longitude}')::numeric,
    booking_payload->>'deliveryInstructions', booking_payload->>'senderName', booking_payload->>'senderPhone',
    booking_payload->>'recipientName', booking_payload->>'recipientPhone', (booking_payload->>'payer')::public.payer_type,
    selected_quote.payment_method, selected_quote.service_level, nullif(booking_payload->>'scheduledAt','')::timestamptz,
    coalesce(booking_payload->'additionalStops','[]'::jsonb), coalesce((booking_payload->>'oversized')::boolean,false),
    selected_quote.distance_meters, selected_quote.amount_minor, selected_quote.currency, 'website', true
  ) returning * into created_order;
  insert into public.delivery_packages(order_id, category, size, description, handling_instructions, declared_value_minor)
  values(created_order.id, booking_payload->>'packageCategory', booking_payload->>'packageSize', coalesce(booking_payload->>'packageDescription',''), booking_payload->>'handlingInstructions', nullif(booking_payload->>'declaredValueMinor','')::integer);
  insert into public.guest_order_access_tokens(order_id, token_hash, expires_at)
  values(created_order.id, guest_access_token_hash, guest_access_expires_at);
  update public.guest_quote_access_tokens set consumed_at = now(), confirmation_idempotency_key = booking_idempotency where id = selected_token.id;
  insert into public.audit_logs(actor_type, action, resource_type, resource_id, metadata)
  values('customer','guest_order.created','delivery_order',created_order.id,jsonb_build_object('quoteId',selected_quote.id,'payer',created_order.payer,'bookingOrigin','website'));
  return jsonb_build_object('order_id', created_order.id, 'order_reference', created_order.order_reference, 'tracking_reference', created_order.tracking_reference, 'payment_status', created_order.payment_status, 'guest_access_expires_at', guest_access_expires_at, 'idempotent_replay', false);
end;
$$;

revoke all on function public.create_guest_delivery_order(jsonb,text,text,timestamptz) from public, anon, authenticated;
grant execute on function public.create_guest_delivery_order(jsonb,text,text,timestamptz) to service_role;
