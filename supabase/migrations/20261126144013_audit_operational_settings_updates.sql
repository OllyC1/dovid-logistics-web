-- Operating rules directly affect booking eligibility, rider workload and
-- safety decisions. Update them atomically with an immutable audit record.
create or replace function public.update_service_area_operational_settings(
  target_service_area_id uuid,
  actor_id uuid,
  settings_payload jsonb,
  change_reason text
) returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare
  previous_settings public.service_area_operational_settings%rowtype;
  current_settings public.service_area_operational_settings%rowtype;
  standard_distance integer;
  manual_distance integer;
  restrictions_confirmed boolean;
begin
  if not private.has_staff_permission_for(actor_id, 'zones.manage') then
    raise exception 'operating settings authorization required';
  end if;
  if length(trim(coalesce(change_reason, ''))) < 8 then
    raise exception 'operational change reason required';
  end if;
  if jsonb_typeof(settings_payload) is distinct from 'object' then
    raise exception 'operational settings payload must be an object';
  end if;

  standard_distance := (settings_payload->>'standard_max_distance_meters')::integer;
  manual_distance := (settings_payload->>'manual_max_distance_meters')::integer;
  restrictions_confirmed := coalesce((settings_payload->>'motorcycle_restrictions_confirmed')::boolean, false);
  if standard_distance is null or manual_distance is null or manual_distance <= standard_distance then
    raise exception 'manual threshold must be above standard threshold';
  end if;

  select * into previous_settings
  from public.service_area_operational_settings
  where service_area_id = target_service_area_id
  for update;
  if not found then raise exception 'service area operational settings not found'; end if;

  update public.service_area_operational_settings set
    standard_max_distance_meters = standard_distance,
    manual_max_distance_meters = manual_distance,
    max_active_assignments_per_rider = (settings_payload->>'max_active_assignments_per_rider')::integer,
    standard_package_sizes = settings_payload->'standard_package_sizes',
    oversized_requires_manual_approval = (settings_payload->>'oversized_requires_manual_approval')::boolean,
    service_hours = settings_payload->'service_hours',
    same_day_booking_cutoff = (settings_payload->>'same_day_booking_cutoff')::time,
    handover_buffer_minutes = (settings_payload->>'handover_buffer_minutes')::integer,
    safe_completion_buffer_minutes = (settings_payload->>'safe_completion_buffer_minutes')::integer,
    waiting_free_minutes = (settings_payload->>'waiting_free_minutes')::integer,
    waiting_fee_per_minute_kobo = (settings_payload->>'waiting_fee_per_minute_kobo')::integer,
    maximum_continuous_riding_minutes = (settings_payload->>'maximum_continuous_riding_minutes')::integer,
    minimum_break_minutes = (settings_payload->>'minimum_break_minutes')::integer,
    motorcycle_restrictions_confirmed_at = case when restrictions_confirmed then now() else null end,
    motorcycle_restrictions_confirmed_by = case when restrictions_confirmed then actor_id else null end,
    motorcycle_restrictions_notes = nullif(trim(settings_payload->>'motorcycle_restrictions_notes'), ''),
    updated_by = actor_id,
    updated_at = now()
  where service_area_id = target_service_area_id
  returning * into current_settings;

  insert into public.audit_logs(actor_id, actor_type, action, resource_type, resource_id, metadata)
  values(
    actor_id,
    'admin',
    'service_area_operational_settings.updated',
    'service_area_operational_settings',
    target_service_area_id,
    jsonb_build_object(
      'reason', trim(change_reason),
      'previous', to_jsonb(previous_settings) - array['updated_by','updated_at'],
      'current', to_jsonb(current_settings) - array['updated_by','updated_at']
    )
  );

  return jsonb_build_object(
    'saved', true,
    'updatedAt', current_settings.updated_at,
    'auditAction', 'service_area_operational_settings.updated'
  );
end;
$$;

revoke all on function public.update_service_area_operational_settings(uuid,uuid,jsonb,text) from public, anon, authenticated;
grant execute on function public.update_service_area_operational_settings(uuid,uuid,jsonb,text) to service_role;
