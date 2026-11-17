\set ON_ERROR_STOP on

begin;

insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data)
values
  ('66666666-6666-4666-8666-666666666661','fleet-admin@example.test',now(),'{"full_name":"Fleet Admin"}'),
  ('66666666-6666-4666-8666-666666666662','fleet-rider@example.test',now(),'{"full_name":"Fleet Rider"}');

insert into public.staff_invitations(id,email,intended_role,status,auth_user_id,invited_by,sent_at,accepted_at,expires_at)
values('86000000-0000-4000-8000-000000000001','fleet-rider@example.test','rider','accepted','66666666-6666-4666-8666-666666666662','66666666-6666-4666-8666-666666666661',now(),now(),now()+interval '1 hour');

insert into public.staff_memberships(user_id,staff_role,status,invitation_id,identity_verified_at,identity_verified_by,identity_verification_method,identity_verification_reference)
values('66666666-6666-4666-8666-666666666662','rider','active','86000000-0000-4000-8000-000000000001',now(),'66666666-6666-4666-8666-666666666661','test fixture','FLEET-RIDER-001');
update public.profiles set role='rider' where id='66666666-6666-4666-8666-666666666662';

insert into public.fleet_vehicles(id,code,registration_number,manufacturer,model,operational_status,safety_status)
values('86000000-0000-4000-8000-000000000010','TEST-BIKE-01','ibd 123 xy','Honda','Ace 125','offline','review_required');

do $$
begin
  if (select registration_number from public.fleet_vehicles where id='86000000-0000-4000-8000-000000000010') <> 'IBD 123 XY' then
    raise exception 'plate number was not normalized';
  end if;

  begin
    insert into public.fleet_vehicles(id,code,registration_number)
    values('86000000-0000-4000-8000-000000000011','TEST-BIKE-02','IBD   123 XY');
    raise exception 'duplicate normalized plate number was accepted';
  exception when unique_violation then null;
  end;

  begin
    update public.fleet_vehicles set operational_status='available'
    where id='86000000-0000-4000-8000-000000000010';
    raise exception 'unready motorcycle became available';
  exception when others then
    if sqlerrm <> 'assign an active rider before activation' then raise; end if;
  end;
end;
$$;

update public.fleet_vehicles
set assigned_rider_id='66666666-6666-4666-8666-666666666662',
    safety_status='cleared',
    max_active_assignments=2,
    max_payload_weight_grams=18000,
    cargo_length_mm=500,
    cargo_width_mm=400,
    cargo_height_mm=400,
    capacity_verified_at=now(),
    capacity_verified_by='66666666-6666-4666-8666-666666666661',
    operational_status='available'
where id='86000000-0000-4000-8000-000000000010';

do $$
begin
  if (select operational_status from public.fleet_vehicles where id='86000000-0000-4000-8000-000000000010') <> 'available' then
    raise exception 'verified motorcycle was not made available';
  end if;

  begin
    insert into public.fleet_vehicles(id,code,registration_number,assigned_rider_id)
    values('86000000-0000-4000-8000-000000000012','TEST-BIKE-03','IBD 456 XY','66666666-6666-4666-8666-666666666662');
    raise exception 'one rider was assigned to multiple motorcycles';
  exception when unique_violation then null;
  end;
end;
$$;

update public.staff_memberships
set status='suspended', suspended_at=now(), suspended_by='66666666-6666-4666-8666-666666666661', suspension_reason='Fleet readiness validation suspension'
where user_id='66666666-6666-4666-8666-666666666662';

do $$
begin
  begin
    insert into public.delivery_runs(run_reference,rider_id,vehicle_id,status,idempotency_key,created_by,compliance_confirmed_at,compliance_confirmed_by,compliance_notes)
    values('RUN-FLEET-GUARD','66666666-6666-4666-8666-666666666662','86000000-0000-4000-8000-000000000010','planned','86000000-0000-4000-8000-000000000020','66666666-6666-4666-8666-666666666661',now(),'66666666-6666-4666-8666-666666666661','Fleet readiness validation');
    raise exception 'suspended rider was assigned a delivery run';
  exception when others then
    if sqlerrm <> 'an active identity-verified rider is required' then raise; end if;
  end;
end;
$$;

rollback;

select 'fleet registry and readiness validation passed' as result;
