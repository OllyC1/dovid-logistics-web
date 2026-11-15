-- Dovid Logistics: security hardening following the two original migrations.
-- Apply all three migrations together before creating any customer accounts.

-- Prevent authenticated customers from inserting/deleting their profile, or changing roles.
drop policy if exists profiles_own on public.profiles;
create policy profiles_read_self on public.profiles for select to authenticated
  using ((select auth.uid()) = id);
create policy profiles_update_self on public.profiles for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- Table-wide UPDATE must be revoked before granting a restricted column subset.
-- Existing project grants and roles should be inspected after application.
revoke insert, update, delete on public.profiles from anon, authenticated;
grant update (full_name, phone, default_currency, updated_at)
  on public.profiles to authenticated;

-- Payment intents should be initialized by authenticated server logic after
-- confirming order ownership, total, and provider reference, never by users.
drop policy if exists intents_own_insert on public.payment_intents;
revoke insert, update, delete on public.payment_intents from anon, authenticated;

-- Lock down tables omitted from RLS in the original files. These are service-role
-- only until explicit, narrowly-scoped policies are added where needed.
alter table public.service_areas enable row level security;
alter table public.service_zones enable row level security;
alter table public.pricing_rules enable row level security;
alter table public.payment_events enable row level security;
alter table public.verified_payment_accounts enable row level security;
alter table public.receiver_payment_tokens enable row level security;
alter table public.audit_logs enable row level security;
alter table public.business_enquiries enable row level security;

-- Public marketing pages can read active service area names but not internal zone
-- polygons or sensitive payment evidence. Only grant the minimum data needed.
create policy service_areas_active_read on public.service_areas for select to anon, authenticated
  using (active = true);

-- Remove default execution permissions on trigger function.
revoke all on function public.handle_new_user() from public, anon, authenticated;

-- Function execution must stay server-side except where expressly intended.
revoke all on function public.record_verified_payment(uuid,text,jsonb)
  from public, anon, authenticated;
revoke all on function public.transition_delivery_order(uuid,public.delivery_status,jsonb)
  from public, anon, authenticated;

-- Role bootstrap: promote founders/admins via trusted server-only operation,
-- NEVER through customer profile editing or signup metadata.

-- A confirmed quote may fund only one order, regardless of idempotency keys.
create unique index delivery_orders_quote_once_idx on public.delivery_orders(quote_id);

-- Bind every price-, coverage-, and fulfilment-sensitive booking field to the
-- confirmed quote. Contact details and delivery instructions may still be added
-- at booking because they do not alter the quoted price or covered route.
create or replace function public.create_delivery_order(booking_payload jsonb) returns jsonb
language plpgsql security definer set search_path=public,extensions as $$
declare
  current_user_id uuid := auth.uid();
  selected_quote public.quotes%rowtype;
  created_order public.delivery_orders%rowtype;
  order_ref text;
  tracking_ref text;
  receiver_token text;
begin
  if current_user_id is null then raise exception 'authentication required'; end if;
  select * into created_order
  from public.delivery_orders
  where customer_id=current_user_id
    and idempotency_key=(booking_payload->>'idempotencyKey')::uuid;
  if found then
    if created_order.quote_id is distinct from (booking_payload->>'quoteId')::uuid then
      raise exception 'idempotency key has already been used for another quote';
    end if;
    return jsonb_build_object(
      'order_id',created_order.id,
      'order_reference',created_order.order_reference,
      'tracking_reference',created_order.tracking_reference,
      'payment_status',created_order.payment_status,
      'receiver_payment_token',null
    );
  end if;

  select * into selected_quote
  from public.quotes
  where id=(booking_payload->>'quoteId')::uuid
    and customer_id=current_user_id
    and status='confirmed'
    and expires_at>now()
  for update;
  if not found then raise exception 'confirmed quote is missing or expired'; end if;
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
    or selected_quote.payment_method is distinct from booking_payload->>'paymentMethod'
  then raise exception 'booking does not match confirmed quote'; end if;

  order_ref := 'DOV-'||to_char(now(),'YYMMDD')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));
  tracking_ref := 'TRK-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,14));
  insert into public.delivery_orders(
    customer_id,quote_id,pricing_configuration_version_id,pricing_snapshot,
    order_reference,tracking_reference,idempotency_key,
    pickup_address,pickup_latitude,pickup_longitude,pickup_instructions,
    delivery_address,delivery_latitude,delivery_longitude,delivery_instructions,
    sender_name,sender_phone,recipient_name,recipient_phone,payer,payment_method,
    service_level,scheduled_at,additional_stops,oversized,distance_meters,
    quoted_amount_minor,currency
  ) values (
    current_user_id,selected_quote.id,selected_quote.pricing_configuration_version_id,
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
    order_ref,tracking_ref,(booking_payload->>'idempotencyKey')::uuid,
    booking_payload->>'pickupAddress',(booking_payload#>>'{pickupCoordinates,latitude}')::numeric,(booking_payload#>>'{pickupCoordinates,longitude}')::numeric,booking_payload->>'pickupInstructions',
    booking_payload->>'deliveryAddress',(booking_payload#>>'{deliveryCoordinates,latitude}')::numeric,(booking_payload#>>'{deliveryCoordinates,longitude}')::numeric,booking_payload->>'deliveryInstructions',
    booking_payload->>'senderName',booking_payload->>'senderPhone',booking_payload->>'recipientName',booking_payload->>'recipientPhone',
    (booking_payload->>'payer')::public.payer_type,booking_payload->>'paymentMethod',coalesce(booking_payload->>'serviceLevel','standard'),
    nullif(booking_payload->>'scheduledAt','')::timestamptz,coalesce(booking_payload->'additionalStops','[]'::jsonb),
    coalesce((booking_payload->>'oversized')::boolean,false),selected_quote.distance_meters,selected_quote.amount_minor,selected_quote.currency
  )
  returning * into created_order;

  insert into public.delivery_packages(order_id,category,size,description,handling_instructions,declared_value_minor)
  values(created_order.id,booking_payload->>'packageCategory',booking_payload->>'packageSize',booking_payload->>'packageDescription',booking_payload->>'handlingInstructions',nullif(booking_payload->>'declaredValueMinor','')::integer)
  on conflict(order_id) do nothing;
  insert into public.delivery_status_events(order_id,previous_status,new_status,actor_id,actor_type)
  select created_order.id,null,created_order.delivery_status,current_user_id,'customer'
  where not exists(select 1 from public.delivery_status_events where order_id=created_order.id and previous_status is null and new_status=created_order.delivery_status);
  if created_order.payer<>'sender' and not exists(select 1 from public.receiver_payment_tokens where order_id=created_order.id) then
    receiver_token:=replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','');
    insert into public.receiver_payment_tokens(order_id,token_hash,expires_at)
    values(created_order.id,encode(digest(receiver_token,'sha256'),'hex'),now()+interval '48 hours');
  end if;
  return jsonb_build_object(
    'order_id',created_order.id,
    'order_reference',created_order.order_reference,
    'tracking_reference',created_order.tracking_reference,
    'payment_status',created_order.payment_status,
    'receiver_payment_token',receiver_token
  );
end;
$$;

revoke all on function public.create_delivery_order(jsonb) from public,anon;
grant execute on function public.create_delivery_order(jsonb) to authenticated,service_role;
