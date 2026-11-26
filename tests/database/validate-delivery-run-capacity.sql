\set ON_ERROR_STOP on

begin;

\ir fixtures/operational-base.sql

update public.staff_memberships
set identity_verified_at=now(),
    identity_verified_by='44444444-4444-4444-4444-444444444444',
    identity_verification_method='controlled database validation',
    identity_verification_reference='RUN-CAPACITY-VALIDATION'
where user_id='33333333-3333-3333-3333-333333333333';

update public.service_area_operational_settings
set max_active_assignments_per_rider=1,
    maximum_continuous_riding_minutes=180,
    minimum_break_minutes=20
where service_area_id='10000000-0000-4000-8000-000000000001';

update public.fleet_vehicles
set registration_number='IBD 910 RC',
    assigned_rider_id='33333333-3333-3333-3333-333333333333',
    operational_status='available',
    safety_status='cleared',
    max_active_assignments=10,
    max_payload_weight_grams=18000,
    cargo_length_mm=500,
    cargo_width_mm=400,
    cargo_height_mm=400,
    capacity_verified_at=now(),
    capacity_verified_by='44444444-4444-4444-4444-444444444444'
where id='20000000-0000-4000-8000-000000000001';

insert into public.quotes(
  id,pricing_rule_id,customer_id,request_payload,distance_meters,amount_minor,
  expires_at,status,service_level,payment_method
) values
  ('91000000-0000-4000-8000-000000000001','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','11111111-1111-1111-1111-111111111111','{"packageSize":"small","packageCategory":"parcel","additionalStops":[],"oversized":false}',5000,200000,now()+interval '1 hour','confirmed','standard','online'),
  ('91000000-0000-4000-8000-000000000002','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','11111111-1111-1111-1111-111111111111','{"packageSize":"small","packageCategory":"parcel","additionalStops":[],"oversized":false}',5000,200000,now()+interval '1 hour','confirmed','standard','online');

insert into public.delivery_orders(
  id,customer_id,quote_id,order_reference,tracking_reference,idempotency_key,
  pickup_address,pickup_latitude,pickup_longitude,pickup_zone_id,
  delivery_address,delivery_latitude,delivery_longitude,delivery_zone_id,
  sender_name,sender_phone,recipient_name,recipient_phone,payer,payment_method,
  delivery_status,payment_status,distance_meters,quoted_amount_minor
) values
  ('91000000-0000-4000-8000-000000000011','11111111-1111-1111-1111-111111111111','91000000-0000-4000-8000-000000000001','DOV-RUN-CAP-1','TRK-RUN-CAP-1','91000000-0000-4000-8000-000000000021','Pickup one',7.3,3.9,'10000000-0000-4000-8000-00000000000a','Delivery one',7.4,3.8,'10000000-0000-4000-8000-00000000000c','Sender','08000000000','Receiver','08000000001','receiver_before_delivery','online','awaiting_assignment','unpaid',5000,200000),
  ('91000000-0000-4000-8000-000000000012','11111111-1111-1111-1111-111111111111','91000000-0000-4000-8000-000000000002','DOV-RUN-CAP-2','TRK-RUN-CAP-2','91000000-0000-4000-8000-000000000022','Pickup two',7.31,3.91,'10000000-0000-4000-8000-00000000000a','Delivery two',7.41,3.81,'10000000-0000-4000-8000-00000000000c','Sender','08000000000','Receiver','08000000001','receiver_before_delivery','online','awaiting_assignment','unpaid',5000,200000);

insert into public.delivery_packages(
  order_id,category,size,description,weight_grams,length_mm,width_mm,height_mm
) values
  ('91000000-0000-4000-8000-000000000011','parcel','small','First controlled parcel',1000,200,150,100),
  ('91000000-0000-4000-8000-000000000012','parcel','small','Second controlled parcel',1000,200,150,100);

-- The legacy order-context trigger derives zone ids from quote payloads. Keep
-- this controlled fixture explicit so the rider-rest rules resolve exactly as
-- they do for current application quotes.
update public.delivery_orders
set pickup_zone_id='10000000-0000-4000-8000-00000000000a',
    delivery_zone_id='10000000-0000-4000-8000-00000000000c'
where id in (
  '91000000-0000-4000-8000-000000000011',
  '91000000-0000-4000-8000-000000000012'
);

do $$
declare
  run_id uuid;
begin
  run_id:=public.create_delivery_run(
    '20000000-0000-4000-8000-000000000001',
    '33333333-3333-3333-3333-333333333333',
    '44444444-4444-4444-4444-444444444444',
    now(),
    'Controlled delivery-run capacity validation',
    '91000000-0000-4000-8000-000000000031'
  );

  perform public.assign_order_to_delivery_run(
    '91000000-0000-4000-8000-000000000011',run_id,
    '44444444-4444-4444-4444-444444444444',
    '{"deadlineConflict":false,"durationSeconds":1800}'::jsonb,null,
    '91000000-0000-4000-8000-000000000032'
  );

  begin
    perform public.assign_order_to_delivery_run(
      '91000000-0000-4000-8000-000000000012',run_id,
      '44444444-4444-4444-4444-444444444444',
      '{"deadlineConflict":false,"durationSeconds":1800}'::jsonb,null,
      '91000000-0000-4000-8000-000000000033'
    );
    raise exception 'delivery run exceeded the configured rider parcel limit';
  exception when others then
    if sqlerrm <> 'rider parcel-count capacity exceeded (1 active of 1)' then
      raise;
    end if;
  end;

  if exists(
    select 1 from public.delivery_assignments
    where order_id='91000000-0000-4000-8000-000000000012'
  ) or exists(
    select 1 from public.run_assignments
    where order_id='91000000-0000-4000-8000-000000000012'
  ) or exists(
    select 1 from public.delivery_run_stops
    where order_id='91000000-0000-4000-8000-000000000012'
  ) then
    raise exception 'failed rider-capacity assignment left partial run records';
  end if;

  update public.service_area_operational_settings
  set max_active_assignments_per_rider=2,
      maximum_continuous_riding_minutes=15
  where service_area_id='10000000-0000-4000-8000-000000000001';

  begin
    perform public.assign_order_to_delivery_run(
      '91000000-0000-4000-8000-000000000012',run_id,
      '44444444-4444-4444-4444-444444444444',
      '{"deadlineConflict":false,"durationSeconds":1800}'::jsonb,null,
      '91000000-0000-4000-8000-000000000035'
    );
    raise exception 'delivery run exceeded the continuous riding limit';
  exception when others then
    if sqlerrm <> 'delivery run exceeds maximum continuous riding time (1800 seconds over 15 minutes)' then
      raise;
    end if;
  end;

  if exists(
    select 1 from public.delivery_assignments
    where order_id='91000000-0000-4000-8000-000000000012'
  ) or exists(
    select 1 from public.run_assignments
    where order_id='91000000-0000-4000-8000-000000000012'
  ) then
    raise exception 'failed riding-limit assignment left partial records';
  end if;

  begin
    perform public.create_delivery_run(
      '20000000-0000-4000-8000-000000000001',
      '33333333-3333-3333-3333-333333333333',
      '44444444-4444-4444-4444-444444444444',
      now(),
      'A second overlapping controlled delivery run',
      '91000000-0000-4000-8000-000000000034'
    );
    raise exception 'an overlapping delivery run was created';
  exception when others then
    if sqlerrm not in ('vehicle is not safely available','rider or vehicle has active delivery assignments','rider or vehicle already has an active run') then
      raise;
    end if;
  end;
end;
$$;

rollback;

select 'delivery run capacity validation passed' as result;
