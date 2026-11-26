\set ON_ERROR_STOP on

begin;

\ir fixtures/operational-base.sql

do $$
declare
  area_id uuid;
  zone_id uuid;
  vehicle_id uuid := '93000000-0000-4000-8000-000000000001';
  sender_quote_id uuid := '93000000-0000-4000-8000-000000000010';
  sender_order_id uuid := '93000000-0000-4000-8000-000000000011';
  sender_intent_id uuid := '93000000-0000-4000-8000-000000000012';
  receiver_quote_id uuid := '93000000-0000-4000-8000-000000000020';
  receiver_order_id uuid := '93000000-0000-4000-8000-000000000021';
  free_quote_id uuid := '93000000-0000-4000-8000-000000000030';
  free_order_id uuid := '93000000-0000-4000-8000-000000000031';
  result_id uuid;
begin
  select z.service_area_id, z.id into area_id, zone_id
  from public.service_zones z
  order by z.is_citywide, z.priority
  limit 1;

  if zone_id is null then
    raise exception 'payment-gated dispatch fixture could not find a service zone';
  end if;

  update public.service_area_operational_settings
  set max_active_assignments_per_rider = 10
  where service_area_id = area_id;

  insert into public.fleet_vehicles(
    id, code, registration_number, manufacturer, model, model_year,
    assigned_rider_id, operational_status, safety_status,
    max_active_assignments, max_payload_weight_grams,
    cargo_length_mm, cargo_width_mm, cargo_height_mm,
    capacity_verified_at, capacity_verified_by
  ) values (
    vehicle_id, 'PAYMENT-GATE-BIKE', 'IBD 912 QA', 'Honda', 'Ace 125', 2025,
    '33333333-3333-3333-3333-333333333333', 'available', 'cleared',
    10, 18000, 500, 400, 400,
    now(), '44444444-4444-4444-4444-444444444444'
  );

  insert into public.quotes(
    id, pricing_rule_id, customer_id, request_payload, distance_meters,
    amount_minor, expires_at, status, service_level, payment_method
  ) values
  (
    sender_quote_id, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    '11111111-1111-1111-1111-111111111111',
    jsonb_build_object(
      'pickupAddress', 'Sender payment pickup',
      'deliveryAddress', 'Sender payment delivery',
      'packageSize', 'small',
      'packageCategory', 'parcel',
      'additionalStops', '[]'::jsonb,
      'oversized', false,
      'pickupZoneId', zone_id,
      'deliveryZoneId', zone_id
    ),
    5000, 230000, now() + interval '1 hour', 'confirmed', 'standard', 'online'
  ),
  (
    receiver_quote_id, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    '11111111-1111-1111-1111-111111111111',
    jsonb_build_object(
      'pickupAddress', 'Receiver payment pickup',
      'deliveryAddress', 'Receiver payment delivery',
      'packageSize', 'small',
      'packageCategory', 'parcel',
      'additionalStops', '[]'::jsonb,
      'oversized', false,
      'pickupZoneId', zone_id,
      'deliveryZoneId', zone_id
    ),
    5000, 230000, now() + interval '1 hour', 'confirmed', 'standard', 'online'
  ),
  (
    free_quote_id, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    '11111111-1111-1111-1111-111111111111',
    jsonb_build_object(
      'pickupAddress', 'Complimentary pickup',
      'deliveryAddress', 'Complimentary delivery',
      'packageSize', 'small',
      'packageCategory', 'parcel',
      'additionalStops', '[]'::jsonb,
      'oversized', false,
      'pickupZoneId', zone_id,
      'deliveryZoneId', zone_id
    ),
    5000, 0, now() + interval '1 hour', 'confirmed', 'standard', 'online'
  );

  insert into public.delivery_orders(
    id, customer_id, quote_id, order_reference, tracking_reference,
    idempotency_key, pickup_address, pickup_latitude, pickup_longitude,
    delivery_address, delivery_latitude, delivery_longitude,
    sender_name, sender_phone, recipient_name, recipient_phone, payer,
    payment_method, delivery_status, payment_status, distance_meters,
    quoted_amount_minor, pickup_zone_id, delivery_zone_id
  ) values
  (
    sender_order_id, '11111111-1111-1111-1111-111111111111', sender_quote_id,
    'DOV-PAYMENT-GATE-SENDER', 'TRK-PAYMENT-GATE-SENDER', gen_random_uuid(),
    'Sender payment pickup', 7.4, 3.9, 'Sender payment delivery', 7.41, 3.91,
    'Sender', '08000000000', 'Receiver', '08000000001', 'sender',
    'online', 'awaiting_assignment', 'unpaid', 5000, 230000, zone_id, zone_id
  ),
  (
    receiver_order_id, '11111111-1111-1111-1111-111111111111', receiver_quote_id,
    'DOV-PAYMENT-GATE-RECEIVER', 'TRK-PAYMENT-GATE-RECEIVER', gen_random_uuid(),
    'Receiver payment pickup', 7.4, 3.9, 'Receiver payment delivery', 7.41, 3.91,
    'Sender', '08000000000', 'Receiver', '08000000001', 'receiver_before_delivery',
    'online', 'awaiting_assignment', 'unpaid', 5000, 230000, zone_id, zone_id
  ),
  (
    free_order_id, '11111111-1111-1111-1111-111111111111', free_quote_id,
    'DOV-PAYMENT-GATE-FREE', 'TRK-PAYMENT-GATE-FREE', gen_random_uuid(),
    'Complimentary pickup', 7.4, 3.9, 'Complimentary delivery', 7.41, 3.91,
    'Sender', '08000000000', 'Receiver', '08000000001', 'sender',
    'online', 'awaiting_assignment', 'unpaid', 5000, 0, zone_id, zone_id
  );

  result_id := public.auto_assign_delivery_order(sender_order_id);
  if result_id is not null
    or (select rider_id from public.delivery_orders where id = sender_order_id) is not null
    or exists(select 1 from public.delivery_assignments where order_id = sender_order_id)
  then
    raise exception 'unpaid sender order consumed dispatch capacity';
  end if;

  begin
    perform public.assign_delivery_order(
      sender_order_id,
      vehicle_id,
      '33333333-3333-3333-3333-333333333333',
      '44444444-4444-4444-4444-444444444444',
      '{"source":"payment_gate_validation"}'::jsonb,
      null
    );
    raise exception 'manual assignment bypassed sender payment clearance';
  exception when others then
    if sqlerrm <> 'sender payment clearance required before assignment' then
      raise;
    end if;
  end;

  if exists(select 1 from public.delivery_assignments where order_id = sender_order_id) then
    raise exception 'failed manual assignment left a partial assignment';
  end if;

  begin
    update public.delivery_orders
    set rider_id = '33333333-3333-3333-3333-333333333333',
        delivery_status = 'assigned'
    where id = sender_order_id;
    raise exception 'direct order update bypassed sender payment clearance';
  exception when others then
    if sqlerrm <> 'sender payment clearance required before assignment' then
      raise;
    end if;
  end;

  insert into public.payment_intents(
    id, order_id, provider, provider_reference, amount_minor, currency, status
  ) values (
    sender_intent_id, sender_order_id, 'paystack',
    'payment-gate-sender-reference', 230000, 'NGN', 'processing'
  );

  perform public.record_verified_payment(
    sender_intent_id,
    'payment-gate-sender-transaction',
    '{"event":"charge.success","data":{"amount":230000,"currency":"NGN"}}'::jsonb
  );

  if (select payment_status from public.delivery_orders where id = sender_order_id) <> 'paid'
    or (select delivery_status from public.delivery_orders where id = sender_order_id) <> 'assigned'
    or (select rider_id from public.delivery_orders where id = sender_order_id) is null
    or (select count(*) from public.delivery_assignments where order_id = sender_order_id) <> 1
  then
    raise exception 'verified sender payment did not assign the order exactly once';
  end if;

  perform public.record_verified_payment(
    sender_intent_id,
    'payment-gate-sender-transaction',
    '{"event":"charge.success","data":{"amount":230000,"currency":"NGN"}}'::jsonb
  );

  if (select count(*) from public.delivery_assignments where order_id = sender_order_id) <> 1
    or (select count(*) from public.payment_transactions where payment_intent_id = sender_intent_id) <> 1
  then
    raise exception 'sender payment replay duplicated financial or dispatch records';
  end if;

  perform public.record_payment_refund_event(
    sender_intent_id,
    'payment-gate-pending-refund',
    'refund.pending',
    230000,
    'NGN',
    '{}'::jsonb
  );

  if public.order_has_verified_payment_clearance(sender_order_id) then
    raise exception 'pending refund did not remove sender payment clearance';
  end if;

  perform public.transition_delivery_order(
    sender_order_id,
    'cancelled',
    '{"source":"payment_gate_validation"}'::jsonb
  );

  if (select delivery_status from public.delivery_orders where id = sender_order_id) <> 'cancelled' then
    raise exception 'late payment issue froze the safe cancellation path';
  end if;

  result_id := public.auto_assign_delivery_order(receiver_order_id);
  if result_id is null
    or (select payment_status from public.delivery_orders where id = receiver_order_id) <> 'unpaid'
    or (select delivery_status from public.delivery_orders where id = receiver_order_id) <> 'assigned'
  then
    raise exception 'receiver-pay order was not dispatchable before payment';
  end if;

  if public.order_has_verified_payment_clearance(receiver_order_id) then
    raise exception 'unpaid receiver-pay order incorrectly has handover clearance';
  end if;

  if public.auto_assign_delivery_order(free_order_id) is not null then
    raise exception 'unsettled complimentary sender order was assigned';
  end if;

  perform public.settle_complimentary_payment(free_order_id);

  if (select payment_status from public.delivery_orders where id = free_order_id) <> 'paid'
    or (select delivery_status from public.delivery_orders where id = free_order_id) <> 'assigned'
    or (select count(*) from public.delivery_assignments where order_id = free_order_id) <> 1
    or not public.order_has_verified_payment_clearance(free_order_id)
  then
    raise exception 'complimentary settlement did not create evidence and assign exactly once';
  end if;
end;
$$;

rollback;
