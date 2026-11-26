-- Restore quote-to-booking protections that were accidentally omitted when
-- the guest booking function was redefined for dispatch hardening.
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
  if guest_access_expires_at<=now()+interval '15 minutes'
    or guest_access_expires_at>now()+interval '90 days' then
    raise exception 'guest order access expiry is invalid';
  end if;

  select * into selected_token
  from public.guest_quote_access_tokens
  where token_hash=guest_quote_token_hash
  for update;
  if not found or selected_token.expires_at<=now() then raise exception 'quote link is invalid or expired'; end if;

  if selected_token.consumed_at is not null then
    if selected_token.confirmation_idempotency_key is distinct from booking_idempotency then
      raise exception 'quote has already been used';
    end if;
    select * into created_order
    from public.delivery_orders
    where quote_id=selected_token.quote_id and guest_booking;
    if not found then raise exception 'confirmed guest order is missing'; end if;
    insert into public.guest_order_access_tokens(order_id,token_hash,expires_at)
    values(created_order.id,guest_access_token_hash,guest_access_expires_at)
    on conflict(order_id) do update
      set token_hash=excluded.token_hash,expires_at=excluded.expires_at,
          revoked_at=null,last_used_at=null;
    return jsonb_build_object(
      'order_id',created_order.id,
      'order_reference',created_order.order_reference,
      'tracking_reference',created_order.tracking_reference,
      'payment_status',created_order.payment_status,
      'guest_access_expires_at',guest_access_expires_at,
      'idempotent_replay',true
    );
  end if;

  if selected_token.quote_id is distinct from (booking_payload->>'quoteId')::uuid then
    raise exception 'quote token does not match this booking';
  end if;

  select * into selected_quote
  from public.quotes
  where id=selected_token.quote_id
  for update;
  if not found or selected_quote.expires_at<=now() then raise exception 'quote is missing or expired'; end if;
  if selected_quote.customer_id is not null or selected_quote.status not in ('created','confirmed') then
    raise exception 'quote cannot be confirmed';
  end if;
  if selected_quote.operational_approval_status not in ('not_required','approved') then
    raise exception 'dispatch approval is still required';
  end if;
  if exists(select 1 from public.delivery_orders where quote_id=selected_quote.id) then
    raise exception 'confirmed quote has already been used';
  end if;

  if selected_quote.request_payload->>'pickupAddress' is distinct from booking_payload->>'pickupAddress'
    or selected_quote.request_payload->'pickupCoordinates' is distinct from booking_payload->'pickupCoordinates'
    or selected_quote.request_payload->>'deliveryAddress' is distinct from booking_payload->>'deliveryAddress'
    or selected_quote.request_payload->'deliveryCoordinates' is distinct from booking_payload->'deliveryCoordinates'
    or selected_quote.request_payload->>'packageSize' is distinct from booking_payload->>'packageSize'
    or selected_quote.request_payload->>'packageCategory' is distinct from booking_payload->>'packageCategory'
    or coalesce(selected_quote.request_payload->'additionalStops','[]'::jsonb) is distinct from coalesce(booking_payload->'additionalStops','[]'::jsonb)
    or coalesce(selected_quote.request_payload->'oversized','false'::jsonb) is distinct from coalesce(booking_payload->'oversized','false'::jsonb)
    or selected_quote.request_payload->'declaredValueMinor' is distinct from booking_payload->'declaredValueMinor'
    or coalesce(selected_quote.request_payload->>'payer','sender') is distinct from booking_payload->>'payer'
    or selected_quote.request_payload->'scheduledAt' is distinct from booking_payload->'scheduledAt'
    or selected_quote.service_level is distinct from coalesce(booking_payload->>'serviceLevel','standard')
    or selected_quote.payment_method is distinct from booking_payload->>'paymentMethod' then
    raise exception 'booking does not match confirmed quote';
  end if;

  update public.quotes
  set status='confirmed',confirmed_at=coalesce(confirmed_at,now()),
      confirmation_idempotency_key=booking_idempotency
  where id=selected_quote.id and customer_id is null;
  if not found then raise exception 'quote belongs to another customer'; end if;

  order_ref := 'DOV-'||to_char(now(),'YYMMDD')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));
  tracking_ref := 'TRK-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,14));
  insert into public.delivery_orders(
    customer_id,quote_id,pricing_configuration_version_id,pricing_snapshot,
    order_reference,tracking_reference,idempotency_key,
    pickup_address,pickup_latitude,pickup_longitude,pickup_instructions,
    delivery_address,delivery_latitude,delivery_longitude,delivery_instructions,
    sender_name,sender_phone,recipient_name,recipient_phone,payer,payment_method,
    service_level,scheduled_at,additional_stops,oversized,distance_meters,
    quoted_amount_minor,currency,booking_origin,guest_booking
  ) values (
    null,selected_quote.id,selected_quote.pricing_configuration_version_id,
    jsonb_build_object(
      'quoteId',selected_quote.id,
      'customerTotalKobo',selected_quote.amount_minor,
      'currency',selected_quote.currency,
      'includedCharges',selected_quote.customer_breakdown,
      'configurationVersionId',selected_quote.pricing_configuration_version_id,
      'rateCardId',selected_quote.rate_card_id,
      'promotionCode',selected_quote.request_payload->>'promotionCode',
      'quoteRequest',selected_quote.request_payload,
      'serviceDetails',jsonb_build_object(
        'serviceLevel',selected_quote.service_level,
        'additionalStops',selected_quote.request_payload->'additionalStops',
        'oversized',selected_quote.request_payload->'oversized'
      )
    ),
    order_ref,tracking_ref,booking_idempotency,
    booking_payload->>'pickupAddress',(booking_payload#>>'{pickupCoordinates,latitude}')::numeric,(booking_payload#>>'{pickupCoordinates,longitude}')::numeric,booking_payload->>'pickupInstructions',
    booking_payload->>'deliveryAddress',(booking_payload#>>'{deliveryCoordinates,latitude}')::numeric,(booking_payload#>>'{deliveryCoordinates,longitude}')::numeric,booking_payload->>'deliveryInstructions',
    booking_payload->>'senderName',booking_payload->>'senderPhone',booking_payload->>'recipientName',booking_payload->>'recipientPhone',
    (booking_payload->>'payer')::public.payer_type,selected_quote.payment_method,selected_quote.service_level,
    nullif(booking_payload->>'scheduledAt','')::timestamptz,coalesce(booking_payload->'additionalStops','[]'::jsonb),
    coalesce((booking_payload->>'oversized')::boolean,false),selected_quote.distance_meters,
    selected_quote.amount_minor,selected_quote.currency,'website',true
  ) returning * into created_order;

  insert into public.delivery_packages(order_id,category,size,description,handling_instructions,declared_value_minor)
  values(
    created_order.id,booking_payload->>'packageCategory',booking_payload->>'packageSize',
    coalesce(booking_payload->>'packageDescription',''),booking_payload->>'handlingInstructions',
    nullif(booking_payload->>'declaredValueMinor','')::integer
  );
  insert into public.guest_order_access_tokens(order_id,token_hash,expires_at)
  values(created_order.id,guest_access_token_hash,guest_access_expires_at);
  update public.guest_quote_access_tokens
  set consumed_at=now(),confirmation_idempotency_key=booking_idempotency
  where id=selected_token.id;
  insert into public.audit_logs(actor_type,action,resource_type,resource_id,metadata)
  values('customer','guest_order.created','delivery_order',created_order.id,jsonb_build_object('quoteId',selected_quote.id,'payer',created_order.payer,'bookingOrigin','website'));

  return jsonb_build_object(
    'order_id',created_order.id,
    'order_reference',created_order.order_reference,
    'tracking_reference',created_order.tracking_reference,
    'payment_status',created_order.payment_status,
    'guest_access_expires_at',guest_access_expires_at,
    'idempotent_replay',false
  );
end;
$$;

revoke all on function public.create_guest_delivery_order(jsonb,text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.create_guest_delivery_order(jsonb,text,text,timestamptz) to service_role;
