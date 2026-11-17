\set ON_ERROR_STOP on

grant usage on schema public to authenticated, service_role;
grant select on all tables in schema public to authenticated, service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;

insert into auth.users(id, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', '{"full_name":"Customer One"}'),
  ('22222222-2222-2222-2222-222222222222', '{"full_name":"Customer Two","role":"admin"}'),
  ('33333333-3333-3333-3333-333333333333', '{"full_name":"Rider One"}'),
  ('44444444-4444-4444-4444-444444444444', '{"full_name":"Admin One"}');

update public.profiles set role='rider' where id='33333333-3333-3333-3333-333333333333';
update public.profiles set role='admin' where id='44444444-4444-4444-4444-444444444444';
insert into public.staff_memberships(user_id,staff_role,status) values
  ('33333333-3333-3333-3333-333333333333','rider','active'),
  ('44444444-4444-4444-4444-444444444444','admin','active');
insert into public.staff_permission_grants(user_id,permission_key,granted_by)
select '44444444-4444-4444-4444-444444444444',permission_key,'44444444-4444-4444-4444-444444444444'
from public.staff_permissions
where permission_key not in ('admins.invite','admins.manage_permissions');

insert into public.pricing_rules(id, name, base_fee_minor, per_kilometer_minor, minimum_fee_minor, active)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Validation rule', 180000, 22000, 180000, true);

insert into public.quotes(
  id, pricing_rule_id, customer_id, request_payload, distance_meters, amount_minor,
  expires_at, status, service_level, payment_method
) values (
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  '11111111-1111-1111-1111-111111111111',
  '{"pickupAddress":"A","deliveryAddress":"B","packageSize":"small","packageCategory":"parcel","additionalStops":[],"oversized":"false"}',
  5000, 200000, now() + interval '1 hour', 'confirmed', 'standard', 'online'
);

insert into public.delivery_orders(
  id, customer_id, rider_id, quote_id, order_reference, tracking_reference,
  idempotency_key, pickup_address, pickup_latitude, pickup_longitude,
  delivery_address, delivery_latitude, delivery_longitude, sender_name, sender_phone,
  recipient_name, recipient_phone, payer, payment_method, delivery_status,
  payment_status, distance_meters, quoted_amount_minor
) values (
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  '11111111-1111-1111-1111-111111111111',
  '33333333-3333-3333-3333-333333333333',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  'DOV-VALIDATION', 'TRK-VALIDATION', 'dddddddd-dddd-dddd-dddd-dddddddddddd',
  'Pickup', 7.3, 3.9, 'Delivery', 7.4, 3.8,
  'Sender', '08000000000', 'Recipient', '08000000001', 'sender', 'online',
  'arrived_at_destination', 'unpaid', 5000, 200000
);

insert into public.payment_intents(id, order_id, provider, provider_reference, amount_minor, status)
values (
  'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  'paystack', 'validation-reference', 200000, 'pending'
);

insert into public.promotions(code, kind, value, starts_at, ends_at, active)
values ('VALIDATE10', 'percentage', 1000, now() - interval '1 day', now() + interval '1 day', true);

insert into public.quotes(
  id, pricing_rule_id, customer_id, request_payload, distance_meters, amount_minor,
  expires_at, status, service_level, payment_method
) values (
  'abababab-abab-abab-abab-abababababab',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  '11111111-1111-1111-1111-111111111111',
  '{"pickupAddress":"Pickup","pickupCoordinates":{"latitude":7.3,"longitude":3.9},"deliveryAddress":"Delivery","deliveryCoordinates":{"latitude":7.4,"longitude":3.8},"packageSize":"small","packageCategory":"parcel","declaredValueMinor":50000,"additionalStops":[],"oversized":false,"payer":"sender","paymentMethod":"online","serviceLevel":"standard"}',
  5000, 210000, now() + interval '1 hour', 'confirmed', 'standard', 'online'
);

do $$
declare missing_rls text;
begin
  select string_agg(relname, ', ' order by relname) into missing_rls
  from pg_class
  where relnamespace='public'::regnamespace
    and relkind='r'
    and not relrowsecurity;
  if missing_rls is not null then raise exception 'RLS is disabled on application tables: %', missing_rls; end if;

  if (select count(*) from public.profiles) <> 4 then
    raise exception 'signup trigger did not create every profile';
  end if;
  if (select role from public.profiles where id='22222222-2222-2222-2222-222222222222') <> 'customer' then
    raise exception 'signup metadata changed the customer role';
  end if;

  if has_function_privilege('authenticated','public.record_verified_payment(uuid,text,jsonb)','execute') then
    raise exception 'authenticated role can execute record_verified_payment';
  end if;
  if has_function_privilege('authenticated','public.transition_delivery_order(uuid,public.delivery_status,jsonb)','execute') then
    raise exception 'authenticated role can execute transition_delivery_order';
  end if;
  if has_function_privilege('authenticated','public.handle_new_user()','execute') then
    raise exception 'authenticated role can execute signup trigger function';
  end if;
  if not has_function_privilege('service_role','public.record_verified_payment(uuid,text,jsonb)','execute') then
    raise exception 'service_role cannot execute record_verified_payment';
  end if;
  if not has_function_privilege('service_role','public.transition_delivery_order(uuid,public.delivery_status,jsonb)','execute') then
    raise exception 'service_role cannot execute transition_delivery_order';
  end if;
  if has_function_privilege('authenticated','public.activate_service_zone(uuid,uuid,text)','execute') then
    raise exception 'authenticated role can activate service zones';
  end if;
  if not has_function_privilege('service_role','public.activate_service_zone(uuid,uuid,text)','execute') then
    raise exception 'service role cannot activate reviewed service zones';
  end if;
  if (select count(*) from public.service_zones where service_area_id='10000000-0000-4000-8000-000000000001') <> 6 then
    raise exception 'six Ibadan planning zones were not created';
  end if;
  if exists(select 1 from public.service_zones where service_area_id='10000000-0000-4000-8000-000000000001' and (active or operational_status<>'draft' or boundary_geojson is not null)) then
    raise exception 'an Ibadan planning zone was activated or given fabricated geometry';
  end if;
  if (select count(*) from public.fleet_vehicles where operational_status='offline') <> 2 then
    raise exception 'two-bike offline fleet configuration is missing';
  end if;
  if (select standard_max_distance_meters from public.service_area_operational_settings where service_area_id='10000000-0000-4000-8000-000000000001') <> 12000 then
    raise exception 'standard distance threshold is incorrect';
  end if;
end $$;

set role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);
do $$ begin
  if (select count(*) from public.profiles) <> 1 then raise exception 'customer profile RLS failed'; end if;
  if (select count(*) from public.quotes) <> 2 then raise exception 'customer quote RLS failed'; end if;
  if (select count(*) from public.delivery_orders) <> 1 then raise exception 'customer order RLS failed'; end if;
  if (select count(*) from public.pricing_configurations) <> 0 then raise exception 'customer can read pricing configuration'; end if;
  if (select count(*) from public.promotions) <> 0 then raise exception 'customer can read protected promotions'; end if;

  update public.profiles set full_name='Customer One Updated' where id=auth.uid();
  if (select full_name from public.profiles where id=auth.uid()) <> 'Customer One Updated' then
    raise exception 'customer could not update an allowed profile field';
  end if;

  begin
    update public.profiles set role='admin' where id=auth.uid();
    raise exception 'customer changed their own role';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.profiles where id=auth.uid();
    raise exception 'customer deleted their own profile';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.payment_intents(order_id,provider,provider_reference,amount_minor)
    values('cccccccc-cccc-cccc-cccc-cccccccccccc','paystack','customer-created-intent',200000);
    raise exception 'customer created a payment intent directly';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.service_zones set active=true where id='10000000-0000-4000-8000-00000000000a';
    raise exception 'customer modified a service zone';
  exception when insufficient_privilege then null;
  end;
end $$;

select set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222',false);
do $$ begin
  if (select count(*) from public.quotes) <> 0 then raise exception 'customer can read another customer quote'; end if;
  if (select count(*) from public.delivery_orders) <> 0 then raise exception 'customer can read another customer order'; end if;
end $$;

select set_config('request.jwt.claim.sub','33333333-3333-3333-3333-333333333333',false);
do $$ begin
  if (select count(*) from public.delivery_orders) <> 1 then raise exception 'rider cannot read assigned order'; end if;
end $$;

select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);
do $$
declare
  booking_payload jsonb := '{"quoteId":"abababab-abab-abab-abab-abababababab","idempotencyKey":"12121212-1212-1212-1212-121212121212","pickupAddress":"Pickup","pickupCoordinates":{"latitude":7.3,"longitude":3.9},"deliveryAddress":"Delivery","deliveryCoordinates":{"latitude":7.4,"longitude":3.8},"packageSize":"small","packageCategory":"parcel","packageDescription":"Validation parcel","declaredValueMinor":50000,"additionalStops":[],"oversized":false,"senderName":"Sender","senderPhone":"08000000000","recipientName":"Recipient","recipientPhone":"08000000001","payer":"sender","paymentMethod":"online","serviceLevel":"standard"}';
  created jsonb;
  replayed jsonb;
begin
  begin
    perform public.activate_pricing_configuration_version(
      (select id from public.pricing_configuration_versions where status='active' limit 1),
      'customer activation attempt'
    );
    raise exception 'customer activated pricing configuration';
  exception when others then
    if sqlerrm <> 'admin authorization required' and sqlerrm <> 'permission denied for function activate_pricing_configuration_version' then raise; end if;
  end;

  begin
    perform public.create_delivery_order(
      jsonb_set(booking_payload, '{deliveryCoordinates,latitude}', '7.5'::jsonb)
    );
    raise exception 'tampered coordinates were accepted';
  exception when others then
    if sqlerrm <> 'booking does not match confirmed quote' then raise; end if;
  end;

  created := public.create_delivery_order(booking_payload);
  replayed := public.create_delivery_order(booking_payload);
  if created->>'order_id' is distinct from replayed->>'order_id' then
    raise exception 'order creation idempotency failed';
  end if;
  if (select count(*) from public.delivery_orders where quote_id='abababab-abab-abab-abab-abababababab') <> 1 then
    raise exception 'confirmed quote created more than one order';
  end if;
  if (select pricing_snapshot#>>'{quoteRequest,payer}' from public.delivery_orders where id=(created->>'order_id')::uuid) <> 'sender' then
    raise exception 'immutable quote request was not preserved';
  end if;

  begin
    perform public.create_delivery_order(
      jsonb_set(booking_payload, '{idempotencyKey}', '"13131313-1313-1313-1313-131313131313"'::jsonb)
    );
    raise exception 'confirmed quote was reused';
  exception when others then
    if sqlerrm <> 'confirmed quote has already been used' then raise; end if;
  end;
end $$;
reset role;

update public.service_zones
set boundary_geojson='{"type":"Polygon","coordinates":[[[3.8,7.2],[4.0,7.2],[4.0,7.4],[3.8,7.4],[3.8,7.2]]]}',
    boundary_source='Database validation fixture',booking_eligibility='standard',dispatch_approval_required=false
where id='10000000-0000-4000-8000-00000000000a';

set role service_role;
do $$ begin
  perform public.review_service_zone('10000000-0000-4000-8000-00000000000a','44444444-4444-4444-4444-444444444444','Validated polygon review');
  perform public.approve_service_zone('10000000-0000-4000-8000-00000000000a','44444444-4444-4444-4444-444444444444','Validated explicit approval');
  perform public.activate_service_zone('10000000-0000-4000-8000-00000000000a','44444444-4444-4444-4444-444444444444','Validated explicit activation');
  if not (select active from public.service_zones where id='10000000-0000-4000-8000-00000000000a') then raise exception 'approved zone was not activated'; end if;
  perform public.suspend_service_zone('10000000-0000-4000-8000-00000000000a','44444444-4444-4444-4444-444444444444','Validation cleanup suspension');
  if (select active from public.service_zones where id='10000000-0000-4000-8000-00000000000a') then raise exception 'suspended zone remained active'; end if;
end $$;
reset role;

insert into public.pricing_configuration_versions(
  pricing_configuration_id, version, assumptions, status, effective_at, change_reason
)
select pricing_configuration_id, 2, assumptions, 'draft', now(), 'Validation version'
from public.pricing_configuration_versions where status='active';

set role authenticated;
select set_config('request.jwt.claim.sub','44444444-4444-4444-4444-444444444444',false);
select set_config('request.jwt.claims','{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated","aal":"aal2"}',false);
do $$ begin
  if (select count(*) from public.pricing_configurations) <> 1 then raise exception 'admin pricing RLS failed'; end if;
  if (select count(*) from public.promotions) <> 1 then raise exception 'admin promotion RLS failed'; end if;
  if has_function_privilege('authenticated','public.activate_pricing_configuration_version(uuid,text)','execute') then raise exception 'authenticated client can activate pricing directly'; end if;
end $$;
reset role;

set role service_role;
select set_config('request.jwt.claim.sub','44444444-4444-4444-4444-444444444444',false);
do $$ begin
  perform public.activate_pricing_configuration_version(
    (select id from public.pricing_configuration_versions where version=2),
    'Validated activation path'
  );
  if (select count(*) from public.pricing_configuration_versions where status='active' and version=2) <> 1 then
    raise exception 'pricing version activation failed';
  end if;
end $$;
reset role;

set role service_role;
do $$ begin
  begin
    perform public.transition_delivery_order(
      'cccccccc-cccc-cccc-cccc-cccccccccccc', 'delivered', '{}'::jsonb
    );
    raise exception 'unpaid order was delivered';
  exception when others then
    if sqlerrm <> 'payment clearance required' then raise; end if;
  end;

  update public.payment_intents set status='paid' where id='eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
  update public.delivery_orders set payment_status='paid' where id='cccccccc-cccc-cccc-cccc-cccccccccccc';
  if public.order_has_verified_payment_clearance('cccccccc-cccc-cccc-cccc-cccccccccccc') then
    raise exception 'payment status without transaction evidence cleared handover';
  end if;
  update public.payment_intents set status='pending' where id='eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
  update public.delivery_orders set payment_status='unpaid' where id='cccccccc-cccc-cccc-cccc-cccccccccccc';

  begin
    perform public.record_verified_payment(
      'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'provider-transaction-missing-values', '{"event":"charge.success"}'::jsonb
    );
    raise exception 'payment without provider amount and currency was accepted';
  exception when others then
    if sqlerrm <> 'payment amount mismatch' then raise; end if;
  end;
  perform public.record_verified_payment(
    'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'provider-transaction-1', '{"event":"charge.success","data":{"amount":200000,"currency":"NGN"}}'::jsonb
  );
  perform public.record_verified_payment(
    'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'provider-transaction-1', '{"event":"charge.success","data":{"amount":200000,"currency":"NGN"}}'::jsonb
  );

  if (select payment_status from public.delivery_orders where id='cccccccc-cccc-cccc-cccc-cccccccccccc') <> 'paid' then
    raise exception 'verified payment did not clear order';
  end if;
  if (select count(*) from public.payment_transactions where payment_intent_id='eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee') <> 1 then
    raise exception 'verified payment reconciliation is not idempotent';
  end if;

  insert into public.customer_surcharges(id,order_id,category,description,proposed_amount_kobo,approved_amount_kobo,status,proposed_by,admin_approved_by,admin_approved_at,customer_approved_at,idempotency_key)
  values('edededed-eded-4ded-8ded-edededededed','cccccccc-cccc-cccc-cccc-cccccccccccc','waiting_time','Validated waiting charge',25000,25000,'customer_approved','44444444-4444-4444-4444-444444444444','44444444-4444-4444-4444-444444444444',now(),now(),'edededed-eded-4ded-8ded-111111111111');
  insert into public.payment_intents(id,order_id,surcharge_id,provider,provider_reference,amount_minor,currency,status)
  values('efefefef-efef-4fef-8fef-efefefefefef','cccccccc-cccc-cccc-cccc-cccccccccccc','edededed-eded-4ded-8ded-edededededed','paystack','validation-supplemental-reference',25000,'NGN','processing');

  begin
    perform public.transition_delivery_order('cccccccc-cccc-cccc-cccc-cccccccccccc','delivered','{}'::jsonb);
    raise exception 'mandatory supplemental payment was bypassed';
  exception when others then
    if sqlerrm <> 'payment clearance required' then raise; end if;
  end;
  begin
    perform public.record_verified_payment('efefefef-efef-4fef-8fef-efefefefefef','provider-extra-bad','{"data":{"amount":24000,"currency":"NGN"}}'::jsonb);
    raise exception 'mismatched supplemental amount was accepted';
  exception when others then
    if sqlerrm <> 'payment amount mismatch' then raise; end if;
  end;
  perform public.record_verified_payment('efefefef-efef-4fef-8fef-efefefefefef','provider-extra-1','{"data":{"amount":25000,"currency":"NGN"}}'::jsonb);
  if not public.order_has_verified_payment_clearance('cccccccc-cccc-cccc-cccc-cccccccccccc') then raise exception 'paid supplemental charge did not clear'; end if;

  perform public.record_payment_dispute_event('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee','dispute-validation-1','charge.dispute.create',200000,'NGN','{}'::jsonb);
  perform public.record_payment_dispute_event('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee','dispute-validation-2','charge.dispute.remind',200000,'NGN','{}'::jsonb);
  if public.order_has_verified_payment_clearance('cccccccc-cccc-cccc-cccc-cccccccccccc') then raise exception 'active dispute did not block handover'; end if;
  perform public.record_payment_dispute_event('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee','dispute-validation-1','charge.dispute.resolve',200000,'NGN','{}'::jsonb);
  if public.order_has_verified_payment_clearance('cccccccc-cccc-cccc-cccc-cccccccccccc') then raise exception 'resolving one of multiple disputes restored clearance'; end if;
  perform public.record_payment_dispute_event('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee','dispute-validation-2','charge.dispute.resolve',200000,'NGN','{}'::jsonb);
  if not public.order_has_verified_payment_clearance('cccccccc-cccc-cccc-cccc-cccccccccccc') then raise exception 'resolved dispute did not restore clearance'; end if;

  perform public.record_payment_refund_event('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee','refund-validation','refund.pending',200000,'NGN','{}'::jsonb);
  if public.order_has_verified_payment_clearance('cccccccc-cccc-cccc-cccc-cccccccccccc') then raise exception 'pending refund did not block handover'; end if;
  perform public.record_payment_refund_event('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee','refund-validation','refund.failed',200000,'NGN','{}'::jsonb);
  if not public.order_has_verified_payment_clearance('cccccccc-cccc-cccc-cccc-cccccccccccc') then raise exception 'failed refund did not restore clearance'; end if;

  perform public.record_delivery_proof(
    'cccccccc-cccc-cccc-cccc-cccccccccccc',
    '33333333-3333-3333-3333-333333333333',
    'Validated Recipient',
    'Recipient identity checked during database validation'
  );
  perform public.record_delivery_proof(
    'cccccccc-cccc-cccc-cccc-cccccccccccc',
    '33333333-3333-3333-3333-333333333333',
    'Validated Recipient',
    'Idempotent retry'
  );
  if (select count(*) from public.delivery_proofs where order_id='cccccccc-cccc-cccc-cccc-cccccccccccc')<>1 then
    raise exception 'delivery proof replay was not idempotent';
  end if;
  if (select count(*) from public.audit_logs where resource_id='cccccccc-cccc-cccc-cccc-cccccccccccc' and action='delivery.proof_recorded')<>1 then
    raise exception 'delivery proof was not audited exactly once';
  end if;

  perform public.transition_delivery_order(
    'cccccccc-cccc-cccc-cccc-cccccccccccc', 'delivered',
    '{"source":"validation","actorUserId":"44444444-4444-4444-4444-444444444444","actorRole":"admin"}'::jsonb
  );
  if (select delivery_status from public.delivery_orders where id='cccccccc-cccc-cccc-cccc-cccccccccccc') <> 'delivered' then
    raise exception 'paid order was not delivered';
  end if;
  if (select actor_id from public.delivery_status_events where order_id='cccccccc-cccc-cccc-cccc-cccccccccccc' and new_status='delivered') <> '44444444-4444-4444-4444-444444444444' then
    raise exception 'delivery status actor attribution failed';
  end if;

  perform public.record_payment_refund_event('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee','refund-validation','refund.processed',200000,'NGN','{}'::jsonb);
  perform public.record_payment_refund_event('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee','refund-validation','refund.processed',200000,'NGN','{}'::jsonb);
  begin
    perform public.record_payment_refund_event('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee','refund-overflow','refund.processed',1,'NGN','{}'::jsonb);
    raise exception 'processed refunds exceeded the payment amount';
  exception when others then
    if sqlerrm <> 'processed refunds exceed payment amount' then raise; end if;
  end;
  if (select payment_status from public.delivery_orders where id='cccccccc-cccc-cccc-cccc-cccccccccccc') <> 'refunded' then raise exception 'processed refund did not update the order'; end if;
  if (select count(*) from public.payment_refunds where provider_refund_id='refund-validation') <> 1 then raise exception 'duplicate refund was not idempotent'; end if;
end $$;
reset role;

do $$ begin
  if (select service_hours->'sunday' from public.service_area_operational_settings where service_area_id='10000000-0000-4000-8000-000000000001') <> '["07:00", "22:00"]'::jsonb then
    raise exception 'daily 07:00-22:00 schedule was not configured';
  end if;
  if (select same_day_booking_cutoff from public.service_area_operational_settings where service_area_id='10000000-0000-4000-8000-000000000001') <> '20:30'::time then
    raise exception 'same-day cutoff was not configured';
  end if;
  if has_function_privilege('authenticated','public.accept_assisted_quote(text,text,uuid,public.payer_type,uuid,jsonb)','execute') then
    raise exception 'authenticated clients can execute assisted quote acceptance directly';
  end if;
  if has_function_privilege('authenticated','public.accept_assisted_guest_quote(text,text,public.payer_type,uuid,jsonb,text,timestamptz)','execute')
    or has_function_privilege('anon','public.accept_assisted_guest_quote(text,text,public.payer_type,uuid,jsonb,text,timestamptz)','execute') then
    raise exception 'client roles can execute guest quote acceptance directly';
  end if;
  if not has_function_privilege('service_role','public.accept_assisted_guest_quote(text,text,public.payer_type,uuid,jsonb,text,timestamptz)','execute') then
    raise exception 'service role cannot execute guest quote acceptance';
  end if;
  if has_function_privilege('authenticated','public.issue_guest_receiver_payment_token(text,text,timestamptz)','execute')
    or has_function_privilege('anon','public.issue_guest_receiver_payment_token(text,text,timestamptz)','execute') then
    raise exception 'client roles can issue guest receiver payment tokens directly';
  end if;
  if not has_function_privilege('service_role','public.issue_guest_receiver_payment_token(text,text,timestamptz)','execute') then
    raise exception 'service role cannot issue guest receiver payment tokens';
  end if;
  if has_function_privilege('authenticated','public.respond_to_guest_surcharge(text,uuid,text,text,uuid)','execute')
    or has_function_privilege('anon','public.respond_to_guest_surcharge(text,uuid,text,text,uuid)','execute') then
    raise exception 'client roles can respond to guest surcharges directly';
  end if;
  if has_function_privilege('authenticated','public.assign_order_to_delivery_run(uuid,uuid,uuid,jsonb,text,uuid)','execute') then
    raise exception 'authenticated clients can assign delivery runs directly';
  end if;
  if has_function_privilege('authenticated','public.reorder_delivery_run_stops(uuid,uuid[],uuid,text,uuid)','execute') then
    raise exception 'authenticated clients can reorder delivery runs directly';
  end if;
  if (select count(*) from public.fleet_vehicles where operational_status<>'offline') <> 0 then
    raise exception 'fleet was activated by operations expansion';
  end if;
end $$;

do $$
declare
  guest_payload jsonb := '{"bookingOrigin":"phone_admin","customerName":"Guest Customer","customerPhone":"08000000009","phoneSource":"customer_provided","pickupAddress":"12 Adeoyo Road, Ibadan, Oyo","pickupCoordinates":{"latitude":7.391,"longitude":3.893},"deliveryAddress":"20 Bodija Road, Ibadan, Oyo","deliveryCoordinates":{"latitude":7.435,"longitude":3.91},"packageCategory":"parcel","packageSize":"small","serviceLevel":"standard","paymentMethod":"online","additionalStops":[],"oversized":false,"payer":"sender","senderName":"Guest Customer","senderPhone":"08000000009","recipientName":"Guest Receiver","recipientPhone":"08000000010","packageDescription":"Validation parcel"}'::jsonb;
  accepted jsonb;
  guest_order_id uuid;
begin
  insert into public.quotes(
    id,pricing_rule_id,customer_id,request_payload,distance_meters,amount_minor,currency,
    expires_at,status,service_level,payment_method,booking_origin,operational_approval_status
  ) values (
    '51515151-5151-4151-8151-515151515151','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',null,
    guest_payload,6200,250000,'NGN',now()+interval '1 hour','created','standard','online',
    'phone_admin','not_required'
  );
  insert into public.assisted_booking_drafts(
    id,booking_origin,status,customer_name,customer_phone,phone_source,request_payload,
    created_by,idempotency_key,expires_at
  ) values (
    '52525252-5252-4252-8252-525252525252','phone_admin','quoted','Guest Customer',
    '08000000009','customer_provided',guest_payload,'44444444-4444-4444-4444-444444444444',
    '53535353-5353-4353-8353-535353535353',now()+interval '1 hour'
  );
  update public.assisted_booking_drafts
  set quote_id='51515151-5151-4151-8151-515151515151'
  where id='52525252-5252-4252-8252-525252525252';
  insert into public.assisted_quote_access_tokens(
    draft_id,token_hash,otp_hash,otp_expires_at,verified_at,verification_session_hash,
    verification_session_expires_at,expires_at
  ) values (
    '52525252-5252-4252-8252-525252525252',repeat('a',64),repeat('b',64),
    now()+interval '10 minutes',now(),repeat('c',64),now()+interval '10 minutes',now()+interval '1 hour'
  );

  accepted := public.accept_assisted_guest_quote(
    repeat('a',64),repeat('c',64),'sender','54545454-5454-4454-8454-545454545454',
    '{"termsAccepted":true,"termsVersion":"validation","source":"database_validation"}'::jsonb,
    repeat('d',64),now()+interval '30 days'
  );
  guest_order_id := (accepted->>'order_id')::uuid;
  if guest_order_id is null then raise exception 'guest order was not returned'; end if;
  if not exists(
    select 1 from public.delivery_orders
    where id=guest_order_id and customer_id is null
      and assisted_booking_draft_id='52525252-5252-4252-8252-525252525252'
      and quote_id='51515151-5151-4151-8151-515151515151'
  ) then raise exception 'guest order was not bound to its assisted draft and quote'; end if;
  if (select count(*) from public.delivery_orders where quote_id='51515151-5151-4151-8151-515151515151')<>1 then
    raise exception 'guest acceptance did not create exactly one order';
  end if;
  if not exists(select 1 from public.guest_order_access_tokens where order_id=guest_order_id and token_hash=repeat('d',64)) then
    raise exception 'hashed guest order access was not recorded';
  end if;
  if (select count(*) from public.audit_logs where resource_id=guest_order_id and action='guest_order.created')<>1 then
    raise exception 'guest order creation was not audited exactly once';
  end if;

  accepted := public.accept_assisted_guest_quote(
    repeat('a',64),repeat('c',64),'sender','54545454-5454-4454-8454-545454545454',
    '{"termsAccepted":true,"termsVersion":"validation","source":"database_validation"}'::jsonb,
    repeat('e',64),now()+interval '30 days'
  );
  if (accepted->>'order_id')::uuid<>guest_order_id
    or coalesce((accepted->>'idempotent_replay')::boolean,false) is not true then
    raise exception 'guest acceptance replay was not idempotent';
  end if;
  if (select count(*) from public.delivery_orders where quote_id='51515151-5151-4151-8151-515151515151')<>1
    or not exists(select 1 from public.guest_order_access_tokens where order_id=guest_order_id and token_hash=repeat('e',64)) then
    raise exception 'guest acceptance replay duplicated the order or failed to rotate access';
  end if;
  update public.delivery_orders set payer='receiver_at_delivery' where id=guest_order_id;
  perform public.issue_guest_receiver_payment_token(repeat('e',64),repeat('f',64),now()+interval '48 hours');
  perform public.issue_guest_receiver_payment_token(repeat('e',64),repeat('1',64),now()+interval '48 hours');
  if (select count(*) from public.receiver_payment_tokens where order_id=guest_order_id and consumed_at is null)<>1
    or not exists(select 1 from public.receiver_payment_tokens where order_id=guest_order_id and token_hash=repeat('1',64) and consumed_at is null) then
    raise exception 'guest receiver payment link rotation was not atomic';
  end if;
  insert into public.customer_surcharges(
    id,order_id,category,description,proposed_amount_kobo,status,proposed_by,
    admin_approved_by,admin_approved_at,idempotency_key
  ) values (
    '56565656-5656-4656-8656-565656565656',guest_order_id,'waiting_time','Validation waiting charge',
    50000,'proposed','44444444-4444-4444-4444-444444444444','44444444-4444-4444-4444-444444444444',
    now(),'57575757-5757-4757-8757-575757575757'
  );
  perform public.respond_to_guest_surcharge(
    repeat('e',64),'56565656-5656-4656-8656-565656565656','approve','',
    '58585858-5858-4858-8858-585858585858'
  );
  perform public.respond_to_guest_surcharge(
    repeat('e',64),'56565656-5656-4656-8656-565656565656','approve','',
    '58585858-5858-4858-8858-585858585858'
  );
  if not exists(
    select 1 from public.customer_surcharges
    where id='56565656-5656-4656-8656-565656565656'
      and status='customer_approved' and approved_amount_kobo=50000
  ) then raise exception 'guest surcharge approval was not recorded idempotently'; end if;
  insert into public.customer_surcharges(
    id,order_id,category,description,proposed_amount_kobo,status,proposed_by,
    admin_approved_by,admin_approved_at,idempotency_key
  ) values (
    '59595959-5959-4959-8959-595959595959',guest_order_id,'redelivery','Terminal guard validation',
    60000,'proposed','44444444-4444-4444-4444-444444444444','44444444-4444-4444-4444-444444444444',
    now(),'60606060-6060-4060-8060-606060606060'
  );
  update public.delivery_orders set delivery_status='cancelled' where id=guest_order_id;
  begin
    insert into public.payment_intents(order_id,provider,provider_reference,amount_minor,currency,status)
    values(guest_order_id,'paystack','terminal-guard-validation',250000,'NGN','processing');
    raise exception 'terminal guest order accepted a new payment intent';
  exception when others then
    if sqlerrm<>'terminal delivery cannot accept new payment activity' then raise; end if;
  end;
  begin
    perform public.issue_guest_receiver_payment_token(repeat('e',64),repeat('2',64),now()+interval '48 hours');
    raise exception 'terminal guest order issued a receiver payment token';
  exception when others then
    if sqlerrm<>'terminal delivery cannot accept new payment activity' then raise; end if;
  end;
  begin
    perform public.respond_to_guest_surcharge(
      repeat('e',64),'59595959-5959-4959-8959-595959595959','approve','',
      '61616161-6161-4161-8161-616161616161'
    );
    raise exception 'terminal guest order approved a new surcharge';
  exception when others then
    if sqlerrm<>'terminal delivery cannot approve a new charge' then raise; end if;
  end;
end $$;

set role authenticated;
select set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222',false);
do $$ begin
  if (select count(*) from public.assisted_booking_drafts) <> 0 then raise exception 'customer can read assisted booking drafts'; end if;
  if (select count(*) from public.guest_order_access_tokens) <> 0 then raise exception 'customer can read guest order access tokens'; end if;
  if (select count(*) from public.delivery_runs) <> 0 then raise exception 'customer can read delivery runs'; end if;
  begin
    insert into public.delivery_attempts(order_id,rider_id,attempt_number,status,arrival_time,idempotency_key)
    values('cccccccc-cccc-cccc-cccc-cccccccccccc','33333333-3333-3333-3333-333333333333',1,'attempted',now(),gen_random_uuid());
    raise exception 'customer inserted a delivery attempt';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

select 'migration and RLS validation passed' as result;
