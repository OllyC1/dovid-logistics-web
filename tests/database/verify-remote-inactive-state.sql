select jsonb_pretty(jsonb_build_object(
  'migration_005_applied', exists (
    select 1
    from supabase_migrations.schema_migrations
    where version = '202611140005'
  ),
  'migration_006_applied', exists (
    select 1
    from supabase_migrations.schema_migrations
    where version = '202611140006'
  ),
  'migration_007_applied', exists (
    select 1
    from supabase_migrations.schema_migrations
    where version = '202611140007'
  ),
  'migration_008_applied', exists (
    select 1
    from supabase_migrations.schema_migrations
    where version = '202611140008'
  ),
  'migration_009_applied', exists (
    select 1
    from supabase_migrations.schema_migrations
    where version = '202611140009'
  ),
  'zones', (
    select jsonb_agg(jsonb_build_object(
      'code', code,
      'status', operational_status,
      'active', active,
      'has_boundary', boundary_geojson is not null
    ) order by code)
    from public.service_zones
    where service_area_id = '10000000-0000-4000-8000-000000000001'
  ),
  'fleet', (
    select jsonb_agg(jsonb_build_object(
      'code', code,
      'status', operational_status,
      'rider_assigned', assigned_rider_id is not null,
      'capacity_verified', capacity_verified_at is not null
    ) order by code)
    from public.fleet_vehicles
  ),
  'thresholds', (
    select jsonb_build_object(
      'standard_max_distance_metres', standard_max_distance_meters,
      'manual_approval_max_distance_metres', manual_max_distance_meters,
      'fleet_size', fleet_size,
      'rider_capacity', max_active_assignments_per_rider
    )
    from public.service_area_operational_settings
    where service_area_id = '10000000-0000-4000-8000-000000000001'
  ),
  'live_records', jsonb_build_object(
    'quotes', (select count(*) from public.quotes),
    'orders', (select count(*) from public.delivery_orders),
    'payment_intents', (select count(*) from public.payment_intents),
    'assignments', (select count(*) from public.delivery_assignments),
    'delivery_runs', (select count(*) from public.delivery_runs),
    'assisted_booking_drafts', (select count(*) from public.assisted_booking_drafts),
    'expense_reports', (select count(*) from public.delivery_expense_reports),
    'customer_surcharges', (select count(*) from public.customer_surcharges),
    'delivery_attempts', (select count(*) from public.delivery_attempts)
  ),
  'operating_schedule', (
    select jsonb_build_object(
      'timezone', service_hours->>'timezone',
      'monday', service_hours->'monday',
      'sunday', service_hours->'sunday',
      'same_day_cutoff', same_day_booking_cutoff
    )
    from public.service_area_operational_settings
    where service_area_id = '10000000-0000-4000-8000-000000000001'
  ),
  'authenticated_cannot_update_zones', not has_table_privilege('authenticated', 'public.service_zones', 'UPDATE'),
  'authenticated_cannot_update_settings', not has_table_privilege('authenticated', 'public.service_area_operational_settings', 'UPDATE'),
  'authenticated_cannot_activate_zones', not has_function_privilege('authenticated', 'public.activate_service_zone(uuid,uuid,text)', 'EXECUTE'),
  'authenticated_cannot_assign_orders', not has_function_privilege('authenticated', 'public.assign_delivery_order(uuid,uuid,uuid,uuid,jsonb,text)', 'EXECUTE'),
  'authenticated_cannot_reorder_runs', not has_function_privilege('authenticated', 'public.reorder_delivery_run_stops(uuid,uuid[],uuid,text,uuid)', 'EXECUTE')
  ,'authenticated_cannot_settle_payments', not has_function_privilege('authenticated', 'public.record_verified_payment(uuid,text,jsonb)', 'EXECUTE')
  ,'authenticated_cannot_record_refunds', not has_function_privilege('authenticated', 'public.record_payment_refund_event(uuid,text,text,integer,text,jsonb)', 'EXECUTE')
  ,'authenticated_cannot_record_disputes', not has_function_privilege('authenticated', 'public.record_payment_dispute_event(uuid,text,text,integer,text,jsonb)', 'EXECUTE')
));
