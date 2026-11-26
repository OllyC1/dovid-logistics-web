\set ON_ERROR_STOP on

begin;

insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data)
values('a9000000-0000-4000-8000-000000000001','settings-audit@example.test',now(),'{}'::jsonb);

update public.profiles
set role='admin', full_name='Settings Audit Administrator'
where id='a9000000-0000-4000-8000-000000000001';

insert into public.staff_memberships(user_id,staff_role,status)
values('a9000000-0000-4000-8000-000000000001','super_admin','active');

do $$
begin
  if has_function_privilege('anon','public.update_service_area_operational_settings(uuid,uuid,jsonb,text)','execute')
    or has_function_privilege('authenticated','public.update_service_area_operational_settings(uuid,uuid,jsonb,text)','execute') then
    raise exception 'browser roles can execute privileged operating-settings updates';
  end if;
  if not has_function_privilege('service_role','public.update_service_area_operational_settings(uuid,uuid,jsonb,text)','execute') then
    raise exception 'service role cannot execute operating-settings updates';
  end if;
end;
$$;

set role service_role;

select public.update_service_area_operational_settings(
  '10000000-0000-4000-8000-000000000001',
  'a9000000-0000-4000-8000-000000000001',
  (
    select to_jsonb(settings) || jsonb_build_object(
      'handover_buffer_minutes', 15,
      'safe_completion_buffer_minutes', 20,
      'motorcycle_restrictions_confirmed', true,
      'motorcycle_restrictions_notes', 'Controlled database validation only'
    )
    from public.service_area_operational_settings settings
    where service_area_id='10000000-0000-4000-8000-000000000001'
  ),
  'Validate atomic operating settings history'
);

do $$
declare
  saved_at timestamptz;
begin
  select updated_at into saved_at
  from public.service_area_operational_settings
  where service_area_id='10000000-0000-4000-8000-000000000001'
    and handover_buffer_minutes=15
    and safe_completion_buffer_minutes=20
    and updated_by='a9000000-0000-4000-8000-000000000001'
    and motorcycle_restrictions_confirmed_by='a9000000-0000-4000-8000-000000000001';
  if saved_at is null then raise exception 'operating settings were not updated with the authorized actor'; end if;

  if not exists(
    select 1 from public.audit_logs
    where actor_id='a9000000-0000-4000-8000-000000000001'
      and action='service_area_operational_settings.updated'
      and resource_id='10000000-0000-4000-8000-000000000001'
      and metadata->>'reason'='Validate atomic operating settings history'
      and metadata#>>'{previous,handover_buffer_minutes}' is null
      and metadata#>>'{current,handover_buffer_minutes}'='15'
      and metadata#>>'{current,safe_completion_buffer_minutes}'='20'
  ) then raise exception 'immutable before/after operating-settings audit evidence missing'; end if;
end;
$$;

do $$
declare
  rejected boolean := false;
begin
  begin
    perform public.update_service_area_operational_settings(
      '10000000-0000-4000-8000-000000000001',
      'a9000000-0000-4000-8000-000000000001',
      (select to_jsonb(settings) || jsonb_build_object('motorcycle_restrictions_confirmed',true) from public.service_area_operational_settings settings where service_area_id='10000000-0000-4000-8000-000000000001'),
      'short'
    );
  exception when others then
    rejected := sqlerrm='operational change reason required';
  end;
  if not rejected then raise exception 'short operating-settings reason was not rejected'; end if;
end;
$$;

rollback;
