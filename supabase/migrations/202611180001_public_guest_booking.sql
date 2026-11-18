-- Secure direct guest bookings for the public website.
--
-- Public booking remains controlled by ENABLE_PUBLIC_BOOKINGS. This migration
-- adds the server-only primitives needed to accept a website booking without
-- an Auth account while preserving quote binding, idempotency and audit history.

-- Complete the fleet registry's covering indexes while this migration is still
-- pending. This removes the advisor warning without changing fleet records.
create index if not exists idx_fleet_vehicles_created_by
  on public.fleet_vehicles(created_by);

alter table public.delivery_orders
  add column guest_booking boolean not null default false;

alter table public.delivery_orders
  drop constraint delivery_orders_owner_or_assisted_check;

alter table public.delivery_orders
  add constraint delivery_orders_owner_or_guest_check
  check (
    customer_id is not null
    or assisted_booking_draft_id is not null
    or guest_booking
  ) not valid;

alter table public.delivery_orders
  validate constraint delivery_orders_owner_or_guest_check;

alter table public.delivery_orders
  add constraint delivery_orders_guest_has_no_customer_check
  check (not guest_booking or customer_id is null) not valid;

alter table public.delivery_orders
  validate constraint delivery_orders_guest_has_no_customer_check;

create unique index delivery_orders_guest_idempotency_idx
  on public.delivery_orders(idempotency_key)
  where guest_booking;

create table public.guest_quote_access_tokens (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null unique references public.quotes(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  confirmation_idempotency_key uuid unique,
  created_at timestamptz not null default now(),
  check (expires_at > created_at)
);

create index guest_quote_access_tokens_expiry_idx
  on public.guest_quote_access_tokens(expires_at)
  where consumed_at is null;

alter table public.guest_quote_access_tokens enable row level security;
revoke all on public.guest_quote_access_tokens from public,anon,authenticated;
grant all on public.guest_quote_access_tokens to service_role;

create or replace function public.create_guest_delivery_order(
  booking_payload jsonb,
  guest_quote_token_hash text,
  guest_access_token_hash text,
  guest_access_expires_at timestamptz
) returns jsonb
language plpgsql security definer set search_path=public,extensions as $$
declare
  selected_token public.guest_quote_access_tokens%rowtype;
  selected_quote public.quotes%rowtype;
  created_order public.delivery_orders%rowtype;
  order_ref text;
  tracking_ref text;
  booking_idempotency uuid;
begin
  if guest_quote_token_hash !~ '^[0-9a-f]{64}$'
    or guest_access_token_hash !~ '^[0-9a-f]{64}$' then
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
  if not found then raise exception 'quote link is invalid or expired'; end if;

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

  if selected_token.expires_at<=now() then raise exception 'quote link is invalid or expired'; end if;
  if selected_token.quote_id is distinct from (booking_payload->>'quoteId')::uuid then
    raise exception 'quote token does not match this booking';
  end if;

  select * into selected_quote
  from public.quotes
  where id=selected_token.quote_id
  for update;
  if not found or selected_quote.expires_at<=now() then raise exception 'quote is missing or expired'; end if;
  if selected_quote.customer_id is not null then raise exception 'quote belongs to an account customer'; end if;
  if selected_quote.status not in ('created','confirmed') then raise exception 'quote cannot be confirmed'; end if;
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

  insert into public.delivery_packages(
    order_id,category,size,description,handling_instructions,declared_value_minor
  ) values (
    created_order.id,booking_payload->>'packageCategory',booking_payload->>'packageSize',
    coalesce(booking_payload->>'packageDescription',''),booking_payload->>'handlingInstructions',
    nullif(booking_payload->>'declaredValueMinor','')::integer
  );

  insert into public.delivery_status_events(order_id,previous_status,new_status,actor_type,metadata)
  values(created_order.id,null,created_order.delivery_status,'customer',jsonb_build_object('guest',true,'bookingOrigin','website'));

  insert into public.guest_order_access_tokens(order_id,token_hash,expires_at)
  values(created_order.id,guest_access_token_hash,guest_access_expires_at);

  update public.guest_quote_access_tokens
  set consumed_at=now(),confirmation_idempotency_key=booking_idempotency
  where id=selected_token.id;

  insert into public.audit_logs(actor_type,action,resource_type,resource_id,metadata)
  values('customer','guest_order.created','delivery_order',created_order.id,
    jsonb_build_object('quoteId',selected_quote.id,'payer',created_order.payer,'bookingOrigin','website'));

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

revoke all on function public.create_guest_delivery_order(jsonb,text,text,timestamptz)
  from public,anon,authenticated;
grant execute on function public.create_guest_delivery_order(jsonb,text,text,timestamptz)
  to service_role;

create or replace function public.issue_guest_receiver_payment_token(
  guest_access_token_hash text,
  new_receiver_token_hash text,
  new_expires_at timestamptz
) returns uuid
language plpgsql security definer set search_path=public as $$
declare
  selected_access public.guest_order_access_tokens%rowtype;
  selected_order public.delivery_orders%rowtype;
  created_token_id uuid;
begin
  if guest_access_token_hash !~ '^[0-9a-f]{64}$'
    or new_receiver_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid secure access token';
  end if;
  if new_expires_at<=now()+interval '5 minutes'
    or new_expires_at>now()+interval '49 hours' then
    raise exception 'receiver payment link expiry is invalid';
  end if;
  select * into selected_access from public.guest_order_access_tokens
  where token_hash=guest_access_token_hash for update;
  if not found or selected_access.revoked_at is not null or selected_access.expires_at<=now() then
    raise exception 'guest order link is invalid or expired';
  end if;
  select * into selected_order from public.delivery_orders
  where id=selected_access.order_id for update;
  if not found or selected_order.customer_id is not null
    or (selected_order.assisted_booking_draft_id is null and not selected_order.guest_booking) then
    raise exception 'guest delivery not found';
  end if;
  if selected_order.payer='sender' then raise exception 'sender payment is required'; end if;
  if selected_order.payment_status='paid' then raise exception 'delivery is already paid'; end if;

  insert into public.receiver_payment_tokens(order_id,token_hash,expires_at)
  values(selected_order.id,new_receiver_token_hash,new_expires_at)
  returning id into created_token_id;
  update public.receiver_payment_tokens set consumed_at=coalesce(consumed_at,now())
  where order_id=selected_order.id and id<>created_token_id and consumed_at is null;
  update public.guest_order_access_tokens set last_used_at=now() where id=selected_access.id;
  insert into public.audit_logs(actor_type,action,resource_type,resource_id,metadata)
  values('customer','guest.receiver_payment_link_rotated','delivery_order',selected_order.id,
    jsonb_build_object('expiresAt',new_expires_at));
  return created_token_id;
end;
$$;

revoke all on function public.issue_guest_receiver_payment_token(text,text,timestamptz)
  from public,anon,authenticated;
grant execute on function public.issue_guest_receiver_payment_token(text,text,timestamptz)
  to service_role;

create or replace function public.respond_to_guest_surcharge(
  guest_access_token_hash text,
  target_surcharge_id uuid,
  response_action text,
  response_reason text,
  response_idempotency uuid
) returns text
language plpgsql security definer set search_path=public as $$
declare
  selected_access public.guest_order_access_tokens%rowtype;
  selected_order public.delivery_orders%rowtype;
  selected_surcharge public.customer_surcharges%rowtype;
  next_status text;
begin
  if guest_access_token_hash !~ '^[0-9a-f]{64}$' then raise exception 'invalid secure access token'; end if;
  if response_idempotency is null then raise exception 'response idempotency key is required'; end if;
  if response_action not in ('approve','reject','dispute') then raise exception 'invalid charge response'; end if;
  if response_action in ('reject','dispute') and length(trim(coalesce(response_reason,'')))<3 then
    raise exception 'a short reason is required';
  end if;

  select * into selected_access from public.guest_order_access_tokens
  where token_hash=guest_access_token_hash for update;
  if not found or selected_access.revoked_at is not null or selected_access.expires_at<=now() then
    raise exception 'guest order link is invalid or expired';
  end if;
  select * into selected_order from public.delivery_orders
  where id=selected_access.order_id for update;
  if not found or selected_order.customer_id is not null
    or (selected_order.assisted_booking_draft_id is null and not selected_order.guest_booking) then
    raise exception 'guest delivery not found';
  end if;
  select * into selected_surcharge from public.customer_surcharges
  where id=target_surcharge_id and order_id=selected_order.id for update;
  if not found then raise exception 'charge proposal not found'; end if;

  if selected_surcharge.customer_authorization->>'idempotencyKey'=response_idempotency::text then
    return selected_surcharge.status;
  end if;
  if selected_surcharge.status<>'proposed' then raise exception 'charge proposal has already been answered'; end if;
  next_status := case response_action when 'approve' then 'customer_approved' when 'reject' then 'rejected' else 'disputed' end;
  update public.customer_surcharges
  set status=next_status,
      approved_amount_kobo=case when response_action='approve' then proposed_amount_kobo else approved_amount_kobo end,
      customer_approved_at=case when response_action='approve' then now() else customer_approved_at end,
      customer_authorization=jsonb_build_object(
        'idempotencyKey',response_idempotency,
        'source','secure_guest_order_link',
        'action',response_action,
        'acceptedAt',now()
      ),
      dispute_reason=case when response_action in ('reject','dispute') then trim(response_reason) else dispute_reason end,
      updated_at=now()
  where id=selected_surcharge.id;
  update public.guest_order_access_tokens set last_used_at=now() where id=selected_access.id;
  insert into public.audit_logs(actor_type,action,resource_type,resource_id,metadata)
  values('customer','guest.surcharge_'||response_action,'customer_surcharge',selected_surcharge.id,
    jsonb_build_object('orderId',selected_order.id,'status',next_status));
  return next_status;
end;
$$;

revoke all on function public.respond_to_guest_surcharge(text,uuid,text,text,uuid)
  from public,anon,authenticated;
grant execute on function public.respond_to_guest_surcharge(text,uuid,text,text,uuid)
  to service_role;

