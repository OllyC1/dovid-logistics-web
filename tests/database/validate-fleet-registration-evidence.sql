\set ON_ERROR_STOP on

begin;

insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values
  ('68686868-6868-4868-8868-686868686861','registration-admin@example.test',now(),'{"full_name":"Registration Admin"}'),
  ('68686868-6868-4868-8868-686868686862','registration-rider@example.test',now(),'{"full_name":"Registration Rider"}');

update public.profiles set role='admin' where id='68686868-6868-4868-8868-686868686861';
update public.profiles set role='rider' where id='68686868-6868-4868-8868-686868686862';
insert into public.staff_memberships(
  user_id,staff_role,status,identity_verified_at,identity_verified_by,
  identity_verification_method,identity_verification_reference
) values (
  '68686868-6868-4868-8868-686868686862','rider','active',now(),
  '68686868-6868-4868-8868-686868686861','controlled fixture','REG-RIDER-001'
);
insert into public.staff_memberships(
  user_id,staff_role,status,identity_verified_at,identity_verified_by,
  identity_verification_method,identity_verification_reference
) values (
  '68686868-6868-4868-8868-686868686861','admin','active',now(),
  '68686868-6868-4868-8868-686868686861','controlled fixture','REG-ADMIN-001'
);
insert into public.staff_permission_grants(user_id,permission_key,granted_by)
values('68686868-6868-4868-8868-686868686861','dispatch.manage','68686868-6868-4868-8868-686868686861');

insert into public.fleet_vehicles(
  id,code,registration_number,manufacturer,model,model_year,assigned_rider_id,
  operational_status,safety_status,max_active_assignments,max_payload_weight_grams,
  cargo_length_mm,cargo_width_mm,cargo_height_mm,capacity_verified_at,capacity_verified_by
) values (
  '86000000-0000-4000-8000-000000000020','REG-EVIDENCE-BIKE','TST 999 ZZ',
  'Honda','Ace 125',2025,'68686868-6868-4868-8868-686868686862',
  'offline','cleared',2,18000,500,400,400,now(),'68686868-6868-4868-8868-686868686861'
);

do $$
begin
  begin
    update public.fleet_vehicles set operational_status='available'
    where id='86000000-0000-4000-8000-000000000020';
    raise exception 'plausible plate text unlocked dispatch without registration evidence';
  exception when others then
    if sqlerrm <> 'verify the physical motorcycle registration before activation' then raise; end if;
  end;
end;
$$;

update public.fleet_vehicles
set registration_verified_at=now(),
    registration_verified_by='68686868-6868-4868-8868-686868686861',
    registration_verification_method='controlled physical inspection',
    registration_verification_reference='REG-EVIDENCE-001',
    operational_status='available'
where id='86000000-0000-4000-8000-000000000020';

do $$
begin
  if (select operational_status from public.fleet_vehicles where id='86000000-0000-4000-8000-000000000020') <> 'available' then
    raise exception 'evidence-verified motorcycle did not become available';
  end if;

  begin
    update public.fleet_vehicles set registration_number='TST 998 ZZ'
    where id='86000000-0000-4000-8000-000000000020';
    raise exception 'changed plate inherited the previous registration evidence';
  exception when others then
    if sqlerrm <> 'verify the physical motorcycle registration before activation' then raise; end if;
  end;
end;
$$;

update public.fleet_vehicles
set operational_status='offline', registration_number='TST 998 ZZ'
where id='86000000-0000-4000-8000-000000000020';

select public.update_fleet_vehicle_configuration(
  '86000000-0000-4000-8000-000000000020',
  '68686868-6868-4868-8868-686868686861',
  'TST 998 ZZ',true,'controlled physical inspection','REG-EVIDENCE-002',
  'Honda','Ace 125',2025,'68686868-6868-4868-8868-686868686862',
  'available','cleared',2,18000,500,400,400,true,
  'Reverified physical registration and capacity after plate change'
);

do $$
begin
  if not exists (
    select 1 from public.fleet_vehicles
    where id='86000000-0000-4000-8000-000000000020'
      and registration_verified_at is not null
      and registration_verified_by='68686868-6868-4868-8868-686868686861'
      and registration_verification_method='controlled physical inspection'
      and registration_verification_reference='REG-EVIDENCE-002'
      and operational_status='available'
  ) then
    raise exception 'atomic fleet update did not record fresh registration evidence';
  end if;

  if not exists (
    select 1 from public.audit_logs
    where action='fleet.vehicle.updated'
      and resource_id='86000000-0000-4000-8000-000000000020'
      and metadata->>'registrationVerificationReference'='REG-EVIDENCE-002'
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

select 'fleet registration evidence validation passed' as result;
