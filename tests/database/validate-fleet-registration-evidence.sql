\set ON_ERROR_STOP on

begin;

insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values
  ('68686868-6868-4868-8868-686868686861','optional-fleet-admin@example.test',now(),'{"full_name":"Optional Fleet Admin"}'),
  ('68686868-6868-4868-8868-686868686862','optional-fleet-rider@example.test',now(),'{"full_name":"Optional Fleet Rider"}');

update public.profiles set role='admin' where id='68686868-6868-4868-8868-686868686861';
update public.profiles set role='rider' where id='68686868-6868-4868-8868-686868686862';
insert into public.staff_memberships(
  user_id,staff_role,status,identity_verified_at,identity_verified_by,
  identity_verification_method,identity_verification_reference
) values
  ('68686868-6868-4868-8868-686868686861','admin','active',now(),'68686868-6868-4868-8868-686868686861','controlled fixture','OPTIONAL-ADMIN-001'),
  ('68686868-6868-4868-8868-686868686862','rider','active',now(),'68686868-6868-4868-8868-686868686861','controlled fixture','OPTIONAL-RIDER-001');
insert into public.staff_permission_grants(user_id,permission_key,granted_by)
values('68686868-6868-4868-8868-686868686861','dispatch.manage','68686868-6868-4868-8868-686868686861');

-- Plate, make, model, year and registration evidence are deliberately absent.
-- The bike is still dispatch-ready because the company has assigned an active
-- rider, cleared safety and verified measured carrying capacity.
insert into public.fleet_vehicles(
  id,code,assigned_rider_id,operational_status,safety_status,max_active_assignments,
  max_payload_weight_grams,cargo_length_mm,cargo_width_mm,cargo_height_mm,
  capacity_verified_at,capacity_verified_by
) values (
  '86000000-0000-4000-8000-000000000020','OPTIONAL-METADATA-BIKE',
  '68686868-6868-4868-8868-686868686862','available','cleared',2,
  18000,500,400,400,now(),'68686868-6868-4868-8868-686868686861'
);

do $$
begin
  if not exists (
    select 1 from public.fleet_vehicles
    where id='86000000-0000-4000-8000-000000000020'
      and operational_status='available'
      and registration_number is null
      and manufacturer is null
      and model is null
      and model_year is null
      and registration_verified_at is null
  ) then
    raise exception 'optional fleet metadata unexpectedly blocked an otherwise ready bike';
  end if;

  begin
    update public.fleet_vehicles set capacity_verified_at=null
    where id='86000000-0000-4000-8000-000000000020';
    raise exception 'unverified capacity did not block an available bike';
  exception when others then
    if sqlerrm <> 'record and verify motorcycle capacity before activation' then raise; end if;
  end;
end;
$$;

select public.update_fleet_vehicle_configuration(
  '86000000-0000-4000-8000-000000000020',
  '68686868-6868-4868-8868-686868686861',
  null,true,null,null,
  null,null,null,'68686868-6868-4868-8868-686868686862',
  'available','cleared',2,18000,500,400,400,true,
  'Confirmed company-owned motorcycle with optional descriptive details'
);

do $$
begin
  if not exists (
    select 1 from public.fleet_vehicles
    where id='86000000-0000-4000-8000-000000000020'
      and registration_number is null
      and registration_verified_at is not null
      and registration_verified_by='68686868-6868-4868-8868-686868686861'
      and registration_verification_method is null
      and registration_verification_reference is null
      and operational_status='available'
  ) then
    raise exception 'optional company verification record was not accepted';
  end if;

  if not exists (
    select 1 from public.audit_logs
    where action='fleet.vehicle.updated'
      and resource_id='86000000-0000-4000-8000-000000000020'
      and metadata->>'reason'='Confirmed company-owned motorcycle with optional descriptive details'
  ) then
    raise exception 'atomic fleet update did not record its audit event';
  end if;

  if has_function_privilege('anon','private.enforce_fleet_vehicle_readiness()','execute')
    or has_function_privilege('authenticated','private.enforce_fleet_vehicle_readiness()','execute')
    or has_function_privilege('anon','private.enforce_dispatch_resource_readiness()','execute')
    or has_function_privilege('authenticated','private.enforce_dispatch_resource_readiness()','execute')
    or has_function_privilege('anon','public.update_fleet_vehicle_configuration(uuid,uuid,text,boolean,text,text,text,text,integer,uuid,text,text,integer,integer,integer,integer,integer,boolean,text)','execute')
    or has_function_privilege('authenticated','public.update_fleet_vehicle_configuration(uuid,uuid,text,boolean,text,text,text,text,integer,uuid,text,text,integer,integer,integer,integer,integer,boolean,text)','execute') then
    raise exception 'browser role can execute a private fleet readiness function';
  end if;
end;
$$;

rollback;

select 'optional fleet metadata validation passed' as result;
