\set ON_ERROR_STOP on

begin;

\ir fixtures/operational-base.sql

do $$
begin
  if has_table_privilege('anon','public.availability_request_access_tokens','select')
    or has_table_privilege('authenticated','public.availability_request_access_tokens','select') then
    raise exception 'browser roles can read secure availability continuation tokens';
  end if;
  if not has_table_privilege('service_role','public.availability_request_access_tokens','select') then
    raise exception 'service role cannot read secure availability continuation tokens';
  end if;
end;
$$;

create temporary table validation_enquiry_ids (
  id uuid primary key
) on commit drop;

with inserted as (
  insert into public.support_requests(name,email,phone,subject,message,source)
  values('Support Tester','support@example.test','08000000000','Delivery help','Please help with a controlled delivery test.','website')
  returning id
)
insert into validation_enquiry_ids(id) select id from inserted;

with inserted as (
  insert into public.business_enquiries(name,email,subject,message,source)
  values('Business Tester','business@example.test','Merchant delivery','Please contact us about a controlled merchant test.','website')
  returning id
)
insert into validation_enquiry_ids(id) select id from inserted;

do $$
begin
  if (
    select count(*)
    from public.notifications notification
    join validation_enquiry_ids enquiry on enquiry.id=(notification.metadata->>'enquiryId')::uuid
    where notification.customer_id is null and notification.event_type='website_enquiry_received'
  ) <> 2 then
    raise exception 'website enquiries did not queue exactly two internal emails';
  end if;
  if (
    select count(*)
    from public.notifications notification
    join validation_enquiry_ids enquiry on enquiry.id=(notification.metadata->>'enquiryId')::uuid
    where notification.customer_id is null and notification.event_type='website_enquiry_acknowledged'
  ) <> 2 then
    raise exception 'website enquiries did not queue exactly two acknowledgements';
  end if;
  if exists(
    select 1
    from public.notifications notification
    join validation_enquiry_ids enquiry on enquiry.id=(notification.metadata->>'enquiryId')::uuid
    where notification.event_type like 'website_enquiry_%' and notification.recipient_email is null
  ) then
    raise exception 'website enquiry email was queued without a recipient';
  end if;
  if exists(
    select 1
    from public.notifications notification
    join validation_enquiry_ids enquiry on enquiry.id=(notification.metadata->>'enquiryId')::uuid
    where notification.event_type like 'website_enquiry_%'
      and notification.metadata ? 'actionPath'
  ) then
    raise exception 'website enquiry email was queued with an unrelated application action';
  end if;
  if (
    select count(*)
    from public.notifications notification
    join validation_enquiry_ids enquiry on enquiry.id=(notification.metadata->>'enquiryId')::uuid
    where notification.event_type='website_enquiry_received'
      and notification.metadata ?& array['enquiryName','enquiryEmail','enquirySubject','enquiryMessage']
  ) <> 2 then
    raise exception 'internal website enquiries do not contain structured purpose metadata';
  end if;
end;
$$;

update public.staff_memberships
set identity_verified_at=now(), identity_verified_by='44444444-4444-4444-4444-444444444444',
    identity_verification_method='controlled database validation', identity_verification_reference='CAPACITY-TEST'
where user_id='33333333-3333-3333-3333-333333333333';

do $$
declare area_id uuid;
declare zone_id uuid;
declare test_vehicle_id uuid := '92000000-0000-4000-8000-000000000001';
declare quote_id uuid;
declare order_id uuid;
declare assigned_id uuid;
declare attempt_id uuid;
declare replayed_attempt_id uuid;
declare counter integer;
begin
  select z.service_area_id,z.id into area_id,zone_id
  from public.service_zones z
  order by z.is_citywide,z.priority
  limit 1;
  if zone_id is null then raise exception 'capacity fixture could not find a service zone'; end if;

  update public.service_area_operational_settings
  set max_active_assignments_per_rider=10,waiting_free_minutes=10,waiting_fee_per_minute_kobo=5000
  where service_area_id=area_id;

  insert into public.fleet_vehicles(
    id,code,registration_number,registration_verified_at,registration_verified_by,
    registration_verification_method,registration_verification_reference,manufacturer,model,model_year,
    assigned_rider_id,operational_status,safety_status,
    max_active_assignments,max_payload_weight_grams,cargo_length_mm,cargo_width_mm,cargo_height_mm,
    capacity_verified_at,capacity_verified_by
  ) values(
    test_vehicle_id,'CAPACITY-BIKE','IBD 910 QA',now(),'44444444-4444-4444-4444-444444444444',
    'controlled physical inspection','BOOKING-CAPACITY-REG-001','Honda','Ace 125',2025,
    '33333333-3333-3333-3333-333333333333','available','cleared',
    10,18000,500,400,400,now(),'44444444-4444-4444-4444-444444444444'
  );

  for counter in 1..11 loop
    quote_id:=gen_random_uuid();
    order_id:=gen_random_uuid();
    insert into public.quotes(id,pricing_rule_id,customer_id,request_payload,distance_meters,amount_minor,expires_at,status,service_level,payment_method)
    values(quote_id,'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','11111111-1111-1111-1111-111111111111',jsonb_build_object('pickupAddress','Capacity pickup','deliveryAddress','Capacity delivery','packageSize','small','packageCategory','parcel','additionalStops','[]'::jsonb,'oversized',false,'pickupZoneId',zone_id,'deliveryZoneId',zone_id),5000,200000,now()+interval '1 hour','confirmed','standard','online');
    insert into public.delivery_orders(
      id,customer_id,quote_id,order_reference,tracking_reference,idempotency_key,pickup_address,pickup_latitude,pickup_longitude,
      delivery_address,delivery_latitude,delivery_longitude,sender_name,sender_phone,recipient_name,recipient_phone,payer,
      payment_method,delivery_status,payment_status,distance_meters,quoted_amount_minor,pickup_zone_id,delivery_zone_id
    ) values(
      order_id,'11111111-1111-1111-1111-111111111111',quote_id,'DOV-CAPACITY-'||lpad(counter::text,2,'0'),'TRK-CAPACITY-'||lpad(counter::text,2,'0'),gen_random_uuid(),
      'Capacity pickup',7.4,3.9,'Capacity delivery',7.41,3.91,'Sender','08000000000','Receiver','08000000001','receiver_before_delivery',
      'online','awaiting_assignment','unpaid',5000,200000,zone_id,zone_id
    );
    if counter <= 9 then
      perform public.assign_delivery_order(order_id,test_vehicle_id,'33333333-3333-3333-3333-333333333333','44444444-4444-4444-4444-444444444444','{"source":"capacity_validation"}',null);
    elsif counter = 10 then
      assigned_id:=public.auto_assign_delivery_order(order_id);
      if assigned_id is null then raise exception 'automatic assignment rejected the tenth parcel at nine of ten'; end if;
    else
      assigned_id:=public.auto_assign_delivery_order(order_id);
      if assigned_id is not null then raise exception 'automatic assignment exceeded the verified ten-parcel limit'; end if;
    end if;
  end loop;

  if (select count(*) from public.delivery_assignments where delivery_assignments.vehicle_id=test_vehicle_id and released_at is null) <> 10 then
    raise exception 'verified fleet workload is not exactly ten after capacity test';
  end if;

  perform public.report_delivery_expense(
    (select id from public.delivery_orders where order_reference='DOV-CAPACITY-08'),null,
    '33333333-3333-3333-3333-333333333333','toll_road_access',50000,'Controlled toll cost',null,now(),null,false,false,
    '92000000-0000-4000-8000-000000000080'
  );
  if (select delivery_status from public.delivery_orders where order_reference='DOV-CAPACITY-08') <> 'assigned' then
    raise exception 'expense reporting changed the delivery status';
  end if;

  begin
    perform public.record_delivery_attempt(
      (select id from public.delivery_orders where order_reference='DOV-CAPACITY-07'),null,
      '33333333-3333-3333-3333-333333333333','recipient_unavailable','[]'::jsonb,0,
      'Recipient was not available','{}'::jsonb,null,null,'92000000-0000-4000-8000-000000000070'
    );
    raise exception 'failed attempt was recorded before the pickup journey started';
  exception when others then
    if sqlerrm <> 'delivery status does not allow a failed attempt' then raise; end if;
  end;

  update public.delivery_orders set delivery_status='rider_en_route_to_pickup' where order_reference='DOV-CAPACITY-09';
  attempt_id:=public.record_delivery_attempt(
    (select id from public.delivery_orders where order_reference='DOV-CAPACITY-09'),null,
    '33333333-3333-3333-3333-333333333333','recipient_unavailable','[]'::jsonb,0,
    'Recipient was not available','{}'::jsonb,null,'Called the verified number twice','92000000-0000-4000-8000-000000000090'
  );
  replayed_attempt_id:=public.record_delivery_attempt(
    (select id from public.delivery_orders where order_reference='DOV-CAPACITY-09'),null,
    '33333333-3333-3333-3333-333333333333','recipient_unavailable','[]'::jsonb,0,
    'Recipient was not available','{}'::jsonb,null,'Idempotent replay','92000000-0000-4000-8000-000000000090'
  );
  if attempt_id is distinct from replayed_attempt_id then raise exception 'failed attempt replay was not idempotent'; end if;
  if (select delivery_status from public.delivery_orders where order_reference='DOV-CAPACITY-09') <> 'delivery_failed' then raise exception 'failed attempt did not atomically update the order'; end if;
  if (select count(*) from public.delivery_attempts a join public.delivery_orders o on o.id=a.order_id where o.order_reference='DOV-CAPACITY-09') <> 1 then raise exception 'failed attempt was not recorded exactly once'; end if;

  update public.delivery_orders set delivery_status='cancelled' where order_reference='DOV-CAPACITY-09';
  begin
    perform public.report_delivery_expense(
      (select id from public.delivery_orders where order_reference='DOV-CAPACITY-09'),null,
      '33333333-3333-3333-3333-333333333333','other',10000,'Late invalid cost',null,now(),null,false,false,
      '92000000-0000-4000-8000-000000000091'
    );
    raise exception 'terminal delivery accepted a new expense';
  exception when others then
    if sqlerrm <> 'completed delivery cannot accept a new expense' then raise; end if;
  end;

  update public.delivery_orders set delivery_status='arrived_at_destination'
  where order_reference='DOV-CAPACITY-10';
  if (select count(*) from public.delivery_waiting_sessions w join public.delivery_orders o on o.id=w.order_id where o.order_reference='DOV-CAPACITY-10' and w.status='running') <> 1 then
    raise exception 'arrival did not start exactly one waiting session';
  end if;
  update public.delivery_waiting_sessions set started_at=clock_timestamp()-interval '11 minutes'
  where delivery_waiting_sessions.order_id=(select id from public.delivery_orders where order_reference='DOV-CAPACITY-10');
  update public.delivery_orders set delivery_status='delivery_failed'
  where order_reference='DOV-CAPACITY-10';
  if not exists(
    select 1 from public.delivery_waiting_sessions w join public.delivery_orders o on o.id=w.order_id
    where o.order_reference='DOV-CAPACITY-10' and w.status='completed' and w.calculated_charge_kobo=5000
  ) then raise exception 'automatic waiting completion did not apply the ten-minute free period'; end if;
  if (select count(*) from public.delivery_expense_reports e join public.delivery_orders o on o.id=e.order_id where o.order_reference='DOV-CAPACITY-10' and e.category='waiting_time' and e.amount_kobo=5000) <> 1 then
    raise exception 'automatic waiting completion did not create one review-only expense';
  end if;
end;
$$;

rollback;

select 'booking continuation, capacity, waiting and enquiry validation passed' as result;
