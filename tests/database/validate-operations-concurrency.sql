\set ON_ERROR_STOP on

begin;

\ir fixtures/operational-base.sql

update public.fleet_vehicles
set registration_number='IBD 901 WF', assigned_rider_id='33333333-3333-3333-3333-333333333333',
    safety_status='cleared', max_payload_weight_grams=18000,
    cargo_length_mm=500, cargo_width_mm=400, cargo_height_mm=400,
    capacity_verified_at=now(), capacity_verified_by='44444444-4444-4444-4444-444444444444',
    operational_status='available'
where id='20000000-0000-4000-8000-000000000001';

update public.service_area_operational_settings
set maximum_continuous_riding_minutes=180,minimum_break_minutes=20
where service_area_id='10000000-0000-4000-8000-000000000001';

update public.delivery_orders
set pickup_zone_id='10000000-0000-4000-8000-00000000000a'
where id='cccccccc-cccc-cccc-cccc-cccccccccccc';

insert into public.delivery_runs(
  id, run_reference, rider_id, vehicle_id, status, idempotency_key,
  created_by, compliance_confirmed_at, compliance_confirmed_by, compliance_notes
) values (
  '70000000-0000-4000-8000-000000000001', 'RUN-CONCURRENCY-TEST',
  '33333333-3333-3333-3333-333333333333', '20000000-0000-4000-8000-000000000001',
  'planned', '70000000-0000-4000-8000-000000000002',
  '44444444-4444-4444-4444-444444444444', now(),
  '44444444-4444-4444-4444-444444444444', 'Isolated concurrency validation'
);

insert into public.delivery_run_stops(id, run_id, order_id, stop_type, sequence, address)
values
  ('70000000-0000-4000-8000-000000000003', '70000000-0000-4000-8000-000000000001', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'pickup', 1, 'Pickup'),
  ('70000000-0000-4000-8000-000000000004', '70000000-0000-4000-8000-000000000001', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'dropoff', 1, 'Drop-off');

update public.delivery_runs set route_snapshot=jsonb_build_object(
  'provider','google_routes','distanceMeters',6400,'durationSeconds',1200,
  'expectedCompletionAt','2026-11-14T20:00:00Z','estimatedProfitKobo',85000,
  'suggestedStops',jsonb_build_array(
    jsonb_build_object('id','70000000-0000-4000-8000-000000000003','orderId','cccccccc-cccc-cccc-cccc-cccccccccccc','type','pickup','estimatedArrivalAt','2026-11-14T19:45:00Z'),
    jsonb_build_object('id','70000000-0000-4000-8000-000000000004','orderId','cccccccc-cccc-cccc-cccc-cccccccccccc','type','dropoff','estimatedArrivalAt','2026-11-14T20:00:00Z')
  )
) where id='70000000-0000-4000-8000-000000000001';

do $$
begin
  if (select count(distinct sequence) from public.delivery_run_stops where run_id='70000000-0000-4000-8000-000000000001') <> 2 then
    raise exception 'duplicate stop sequence normalization failed';
  end if;
  if (select route_distance_meters from public.delivery_runs where id='70000000-0000-4000-8000-000000000001') <> 6400 then
    raise exception 'provider route metrics were not persisted';
  end if;
  if (select count(*) from public.delivery_run_stops where run_id='70000000-0000-4000-8000-000000000001' and estimated_arrival_at is not null) <> 2 then
    raise exception 'suggested stop arrival times were not persisted';
  end if;

  begin
    perform public.reorder_delivery_run_stops(
      '70000000-0000-4000-8000-000000000001',
      array['70000000-0000-4000-8000-000000000004'::uuid, '70000000-0000-4000-8000-000000000003'::uuid],
      '44444444-4444-4444-4444-444444444444', 'Invalid drop-off first test',
      '70000000-0000-4000-8000-000000000005'
    );
    raise exception 'drop-off-first route was accepted';
  exception when others then
    if sqlerrm <> 'pickup must remain before drop-off' then raise; end if;
  end;
end;
$$;

select public.reorder_delivery_run_stops(
  '70000000-0000-4000-8000-000000000001',
  array['70000000-0000-4000-8000-000000000003'::uuid, '70000000-0000-4000-8000-000000000004'::uuid],
  '44444444-4444-4444-4444-444444444444', 'Validated pickup-first route',
  '70000000-0000-4000-8000-000000000006'
);

select public.reorder_delivery_run_stops(
  '70000000-0000-4000-8000-000000000001',
  array['70000000-0000-4000-8000-000000000003'::uuid, '70000000-0000-4000-8000-000000000004'::uuid],
  '44444444-4444-4444-4444-444444444444', 'Validated pickup-first route retry',
  '70000000-0000-4000-8000-000000000006'
);

insert into public.run_assignments(run_id, order_id, status, idempotency_key,route_snapshot)
values ('70000000-0000-4000-8000-000000000001', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'delivered', '70000000-0000-4000-8000-000000000007','{"durationSeconds":1200}'::jsonb);
insert into public.run_assignments(run_id, order_id, status, idempotency_key,route_snapshot)
values ('70000000-0000-4000-8000-000000000001', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'assigned', '70000000-0000-4000-8000-000000000008','{"durationSeconds":1200}'::jsonb);

do $$
begin
  if (select version from public.delivery_runs where id='70000000-0000-4000-8000-000000000001') <> 2 then
    raise exception 'manual route reorder did not increment the run version';
  end if;
  if (select count(*) from public.delivery_run_change_history where run_id='70000000-0000-4000-8000-000000000001' and action='manual_route_reorder') <> 1 then
    raise exception 'manual route reorder was not audited';
  end if;
  if has_function_privilege('authenticated', 'public.reorder_delivery_run_stops(uuid,uuid[],uuid,text,uuid)', 'execute') then
    raise exception 'authenticated role can reorder delivery runs directly';
  end if;
  if (select count(*) from public.run_assignments where order_id='cccccccc-cccc-cccc-cccc-cccccccccccc') <> 2 then
    raise exception 'historical assignment prevented a new active assignment';
  end if;
end;
$$;

rollback;

select 'operations concurrency validation passed' as result;
