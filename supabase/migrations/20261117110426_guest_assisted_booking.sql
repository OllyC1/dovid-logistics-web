-- Guest assisted booking hardening.
--
-- Allows a verified assisted-booking recipient to accept a legitimate quote
-- without creating an Auth account. Guest access is server-only, token hashes
-- are stored instead of bearer tokens, and order creation remains atomic with
-- quote consumption and audit history.

alter table public.delivery_orders alter column customer_id drop not null;

alter table public.delivery_orders
  add constraint delivery_orders_owner_or_assisted_check
  check (customer_id is not null or assisted_booking_draft_id is not null)
  not valid;

alter table public.delivery_orders
  validate constraint delivery_orders_owner_or_assisted_check;

create unique index delivery_orders_assisted_draft_once_idx
  on public.delivery_orders(assisted_booking_draft_id)
  where assisted_booking_draft_id is not null;

create table public.guest_order_access_tokens (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.delivery_orders(id) on delete restrict,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  check (expires_at > created_at)
);

create index guest_order_access_tokens_expiry_idx
  on public.guest_order_access_tokens(expires_at)
  where revoked_at is null;

alter table public.guest_order_access_tokens enable row level security;
revoke all on public.guest_order_access_tokens from public,anon,authenticated;
grant all on public.guest_order_access_tokens to service_role;

create or replace function public.accept_assisted_guest_quote(
  access_token_hash text,
  verification_session_hash text,
  selected_payer public.payer_type,
  acceptance_idempotency uuid,
  acceptance_evidence jsonb,
  guest_access_token_hash text,
  guest_access_expires_at timestamptz
) returns jsonb
language plpgsql security definer set search_path=public,extensions as $$
declare
  selected_token public.assisted_quote_access_tokens%rowtype;
  selected_draft public.assisted_booking_drafts%rowtype;
  selected_quote public.quotes%rowtype;
  created_order public.delivery_orders%rowtype;
  accepted_payload jsonb;
  order_ref text;
  tracking_ref text;
  receiver_token text;
begin
  if access_token_hash !~ '^[0-9a-f]{64}$'
    or verification_session_hash !~ '^[0-9a-f]{64}$'
    or guest_access_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid secure access token';
  end if;
  if acceptance_idempotency is null then raise exception 'acceptance idempotency key is required'; end if;
  if jsonb_typeof(acceptance_evidence)<>'object'
    or acceptance_evidence->>'termsAccepted' is distinct from 'true'
    or nullif(trim(acceptance_evidence->>'termsVersion'),'') is null then
    raise exception 'affirmative terms acceptance is required';
  end if;
  if guest_access_expires_at<=now()+interval '15 minutes'
    or guest_access_expires_at>now()+interval '90 days' then
    raise exception 'guest order access expiry is invalid';
  end if;

  select * into selected_token
  from public.assisted_quote_access_tokens
  where token_hash=access_token_hash
  for update;
  if not found then raise exception 'quote link is invalid or expired'; end if;

  select * into selected_draft
  from public.assisted_booking_drafts
  where id=selected_token.draft_id
  for update;
  if not found then raise exception 'assisted booking is unavailable'; end if;

  select * into selected_quote
  from public.quotes
  where id=selected_draft.quote_id
  for update;
  if not found then raise exception 'quote is unavailable'; end if;

  -- A retry with the same browser-held idempotency key may recover a lost
  -- response and rotate the guest bearer token without creating another order.
  if selected_token.acceptance_idempotency_key=acceptance_idempotency
    and selected_token.verification_session_hash=verification_session_hash
    and selected_draft.status='order_created' then
    select * into created_order
    from public.delivery_orders
    where assisted_booking_draft_id=selected_draft.id and quote_id=selected_quote.id;
    if not found then raise exception 'accepted guest order is missing'; end if;
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
      'receiver_payment_token',null,
      'guest_access_expires_at',guest_access_expires_at,
      'idempotent_replay',true
    );
  end if;

  if selected_token.revoked_at is not null or selected_token.consumed_at is not null
    or selected_token.expires_at<=now() then raise exception 'quote link is invalid or expired'; end if;
  if selected_token.verified_at is null then raise exception 'contact verification is required'; end if;
  if selected_token.verification_session_hash is distinct from verification_session_hash
    or selected_token.verification_session_expires_at is null
    or selected_token.verification_session_expires_at<=now() then
    raise exception 'verified quote session has expired';
  end if;
  if selected_token.acceptance_idempotency_key is not null then
    raise exception 'quote link has already been accepted';
  end if;
  if selected_draft.status not in ('quoted','awaiting_customer') then
    raise exception 'assisted booking is not awaiting acceptance';
  end if;
  if selected_quote.expires_at<=now() then raise exception 'quote has expired'; end if;
  if selected_quote.customer_id is not null then raise exception 'quote belongs to an account customer'; end if;
  if selected_quote.status not in ('created','confirmed') then raise exception 'quote cannot be accepted'; end if;
  if exists(select 1 from public.delivery_orders where quote_id=selected_quote.id) then
    raise exception 'confirmed quote has already been used';
  end if;
  if selected_draft.quote_payload_hash is distinct from
    encode(extensions.digest(selected_quote.request_payload::text,'sha256'),'hex') then
    raise exception 'quote details changed after link creation';
  end if;
  if selected_quote.operational_approval_status not in ('not_required','approved') then
    raise exception 'dispatch approval is still required';
  end if;

  accepted_payload:=jsonb_set(selected_draft.request_payload,'{payer}',to_jsonb(selected_payer::text),true);

  -- Bind every route-, pricing-, schedule- and package-sensitive field to the
  -- reviewed quote before an order is written.
  if selected_quote.request_payload->>'pickupAddress' is distinct from accepted_payload->>'pickupAddress'
    or selected_quote.request_payload->'pickupCoordinates' is distinct from accepted_payload->'pickupCoordinates'
    or selected_quote.request_payload->>'deliveryAddress' is distinct from accepted_payload->>'deliveryAddress'
    or selected_quote.request_payload->'deliveryCoordinates' is distinct from accepted_payload->'deliveryCoordinates'
    or selected_quote.request_payload->>'packageSize' is distinct from accepted_payload->>'packageSize'
    or selected_quote.request_payload->>'packageCategory' is distinct from accepted_payload->>'packageCategory'
    or coalesce(selected_quote.request_payload->'additionalStops','[]'::jsonb) is distinct from coalesce(accepted_payload->'additionalStops','[]'::jsonb)
    or coalesce(selected_quote.request_payload->'oversized','false'::jsonb) is distinct from coalesce(accepted_payload->'oversized','false'::jsonb)
    or selected_quote.request_payload->'declaredValueMinor' is distinct from accepted_payload->'declaredValueMinor'
    or selected_quote.request_payload->'scheduledAt' is distinct from accepted_payload->'scheduledAt'
    or selected_quote.service_level is distinct from coalesce(accepted_payload->>'serviceLevel','standard')
    or selected_quote.payment_method is distinct from accepted_payload->>'paymentMethod' then
    raise exception 'assisted booking does not match confirmed quote';
  end if;

  update public.quotes
  set status='confirmed',confirmed_at=coalesce(confirmed_at,now()),
      confirmation_idempotency_key=acceptance_idempotency,
      request_payload=jsonb_set(request_payload,'{payer}',to_jsonb(selected_payer::text),true)
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
    quoted_amount_minor,currency,booking_origin,assisted_booking_draft_id
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
      'quoteRequest',jsonb_set(selected_quote.request_payload,'{payer}',to_jsonb(selected_payer::text),true),
      'serviceDetails',jsonb_build_object(
        'serviceLevel',selected_quote.service_level,
        'additionalStops',selected_quote.request_payload->'additionalStops',
        'oversized',selected_quote.request_payload->'oversized'
      )
    ),
    order_ref,tracking_ref,acceptance_idempotency,
    accepted_payload->>'pickupAddress',(accepted_payload#>>'{pickupCoordinates,latitude}')::numeric,(accepted_payload#>>'{pickupCoordinates,longitude}')::numeric,accepted_payload->>'pickupInstructions',
    accepted_payload->>'deliveryAddress',(accepted_payload#>>'{deliveryCoordinates,latitude}')::numeric,(accepted_payload#>>'{deliveryCoordinates,longitude}')::numeric,accepted_payload->>'deliveryInstructions',
    accepted_payload->>'senderName',accepted_payload->>'senderPhone',accepted_payload->>'recipientName',accepted_payload->>'recipientPhone',
    selected_payer,selected_quote.payment_method,selected_quote.service_level,
    nullif(accepted_payload->>'scheduledAt','')::timestamptz,coalesce(accepted_payload->'additionalStops','[]'::jsonb),
    coalesce((accepted_payload->>'oversized')::boolean,false),selected_quote.distance_meters,
    selected_quote.amount_minor,selected_quote.currency,selected_draft.booking_origin,selected_draft.id
  ) returning * into created_order;

  insert into public.delivery_packages(
    order_id,category,size,description,handling_instructions,declared_value_minor,
    weight_grams,length_mm,width_mm,height_mm
  ) values (
    created_order.id,accepted_payload->>'packageCategory',accepted_payload->>'packageSize',
    accepted_payload->>'packageDescription',accepted_payload->>'handlingInstructions',
    nullif(accepted_payload->>'declaredValueMinor','')::integer,
    nullif(accepted_payload->>'weightGrams','')::integer,
    nullif(accepted_payload->>'lengthMm','')::integer,
    nullif(accepted_payload->>'widthMm','')::integer,
    nullif(accepted_payload->>'heightMm','')::integer
  );

  insert into public.delivery_status_events(order_id,previous_status,new_status,actor_type,metadata)
  values(created_order.id,null,created_order.delivery_status,'customer',jsonb_build_object('guest',true,'assistedBookingDraftId',selected_draft.id));

  if selected_payer<>'sender' then
    receiver_token:=replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','');
    insert into public.receiver_payment_tokens(order_id,token_hash,expires_at)
    values(created_order.id,encode(extensions.digest(receiver_token,'sha256'),'hex'),now()+interval '48 hours');
  end if;

  insert into public.guest_order_access_tokens(order_id,token_hash,expires_at)
  values(created_order.id,guest_access_token_hash,guest_access_expires_at);

  update public.assisted_quote_access_tokens
  set acceptance_idempotency_key=acceptance_idempotency,consumed_at=now()
  where id=selected_token.id;

  update public.assisted_booking_drafts
  set status='order_created',order_id=created_order.id,accepted_at=now(),
      acceptance_channel='secure_guest_link',terms_version=acceptance_evidence->>'termsVersion',
      affirmative_acceptance=acceptance_evidence,request_payload=accepted_payload,updated_at=now()
  where id=selected_draft.id;

  insert into public.assisted_booking_events(draft_id,event_type,actor_type,metadata)
  values
    (selected_draft.id,'quote_accepted','customer',acceptance_evidence||jsonb_build_object('guest',true)),
    (selected_draft.id,'order_created','customer',jsonb_build_object('orderId',created_order.id,'guest',true));

  insert into public.audit_logs(actor_type,action,resource_type,resource_id,metadata)
  values('customer','guest_order.created','delivery_order',created_order.id,
    jsonb_build_object('assistedBookingDraftId',selected_draft.id,'quoteId',selected_quote.id,'payer',selected_payer));

  return jsonb_build_object(
    'order_id',created_order.id,
    'order_reference',created_order.order_reference,
    'tracking_reference',created_order.tracking_reference,
    'payment_status',created_order.payment_status,
    'receiver_payment_token',receiver_token,
    'guest_access_expires_at',guest_access_expires_at,
    'idempotent_replay',false
  );
end;
$$;

revoke all on function public.accept_assisted_guest_quote(text,text,public.payer_type,uuid,jsonb,text,timestamptz)
  from public,anon,authenticated;
grant execute on function public.accept_assisted_guest_quote(text,text,public.payer_type,uuid,jsonb,text,timestamptz)
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
  select * into selected_access
  from public.guest_order_access_tokens
  where token_hash=guest_access_token_hash
  for update;
  if not found or selected_access.revoked_at is not null or selected_access.expires_at<=now() then
    raise exception 'guest order link is invalid or expired';
  end if;
  select * into selected_order
  from public.delivery_orders
  where id=selected_access.order_id
  for update;
  if not found or selected_order.customer_id is not null or selected_order.assisted_booking_draft_id is null then
    raise exception 'guest delivery not found';
  end if;
  if selected_order.payer='sender' then raise exception 'sender payment is required'; end if;
  if selected_order.payment_status='paid' then raise exception 'delivery is already paid'; end if;

  insert into public.receiver_payment_tokens(order_id,token_hash,expires_at)
  values(selected_order.id,new_receiver_token_hash,new_expires_at)
  returning id into created_token_id;
  update public.receiver_payment_tokens
  set consumed_at=coalesce(consumed_at,now())
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
  if not found or selected_order.customer_id is not null or selected_order.assisted_booking_draft_id is null then
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
