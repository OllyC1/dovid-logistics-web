-- Shared, transaction-scoped identities and order used by standalone
-- operations validators. The calling validator owns the surrounding
-- transaction and must roll it back.
insert into auth.users(id, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', '{"full_name":"Operations Customer"}'),
  ('33333333-3333-3333-3333-333333333333', '{"full_name":"Operations Rider"}'),
  ('44444444-4444-4444-4444-444444444444', '{"full_name":"Operations Admin"}');

update public.profiles
set role='rider'
where id='33333333-3333-3333-3333-333333333333';

update public.profiles
set role='admin'
where id='44444444-4444-4444-4444-444444444444';

insert into public.staff_memberships(user_id,staff_role,status) values
  ('33333333-3333-3333-3333-333333333333','rider','active'),
  ('44444444-4444-4444-4444-444444444444','admin','active');

insert into public.pricing_rules(
  id,name,base_fee_minor,per_kilometer_minor,minimum_fee_minor,active
) values (
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','Operations validation rule',
  180000,22000,180000,true
);

insert into public.quotes(
  id,pricing_rule_id,customer_id,request_payload,distance_meters,amount_minor,
  expires_at,status,service_level,payment_method
) values (
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  '11111111-1111-1111-1111-111111111111',
  '{"pickupAddress":"Pickup","deliveryAddress":"Delivery","packageSize":"small","packageCategory":"parcel","additionalStops":[],"oversized":false}',
  5000,200000,now()+interval '1 hour','confirmed','standard','online'
);

insert into public.delivery_orders(
  id,customer_id,rider_id,quote_id,order_reference,tracking_reference,
  idempotency_key,pickup_address,pickup_latitude,pickup_longitude,
  delivery_address,delivery_latitude,delivery_longitude,sender_name,sender_phone,
  recipient_name,recipient_phone,payer,payment_method,delivery_status,
  payment_status,distance_meters,quoted_amount_minor
) values (
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  '11111111-1111-1111-1111-111111111111',
  '33333333-3333-3333-3333-333333333333',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  'DOV-OPERATIONS-VALIDATION','TRK-OPERATIONS-VALIDATION',
  'dddddddd-dddd-dddd-dddd-dddddddddddd',
  'Pickup',7.3,3.9,'Delivery',7.4,3.8,
  'Sender','08000000000','Recipient','08000000001','receiver_before_delivery','online',
  'arrived_at_destination','unpaid',5000,200000
);
