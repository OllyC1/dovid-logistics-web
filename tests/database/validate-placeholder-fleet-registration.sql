\set ON_ERROR_STOP on

begin;

do $$
begin
  if exists (
    select 1
    from public.fleet_vehicles
    where registration_number ~* '^PENDING([- ]|$)'
      and (operational_status in ('available','assigned') or assigned_rider_id is not null)
  ) then
    raise exception 'a placeholder motorcycle remained dispatchable after migration';
  end if;
end;
$$;

insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data)
values
  ('67676767-6767-4767-8767-676767676766','placeholder-admin@example.test',now(),'{"full_name":"Placeholder Guard Admin"}'),
  ('67676767-6767-4767-8767-676767676767','placeholder-rider@example.test',now(),'{"full_name":"Placeholder Guard Rider"}');

insert into public.staff_invitations(id,email,intended_role,status,auth_user_id,invited_by,sent_at,accepted_at,expires_at)
values(
  '87676767-6767-4767-8767-676767676767',
  'placeholder-rider@example.test','rider','accepted',
  '67676767-6767-4767-8767-676767676767','67676767-6767-4767-8767-676767676766',
  now(),now(),now()+interval '1 hour'
);

insert into public.staff_memberships(
  user_id,staff_role,status,invitation_id,identity_verified_at,identity_verified_by,
  identity_verification_method,identity_verification_reference
) values (
  '67676767-6767-4767-8767-676767676767','rider','active',
  '87676767-6767-4767-8767-676767676767',now(),'67676767-6767-4767-8767-676767676766',
  'test fixture','PLACEHOLDER-GUARD-001'
);
update public.profiles set role='rider' where id='67676767-6767-4767-8767-676767676767';

do $$
begin
  begin
    update public.fleet_vehicles
    set assigned_rider_id='67676767-6767-4767-8767-676767676767',
        operational_status='available',
        safety_status='cleared',
        max_payload_weight_grams=18000,
        cargo_length_mm=500,
        cargo_width_mm=400,
        cargo_height_mm=400,
        capacity_verified_at=now()
    where registration_number='PENDING-BIKE-01';
    raise exception 'placeholder motorcycle became dispatchable';
  exception when others then
    if sqlerrm not in (
      'verify the physical motorcycle registration before activation',
      'placeholder motorcycle registration cannot be dispatchable'
    ) then raise; end if;
  end;
end;
$$;

rollback;

select 'placeholder fleet registration validation passed' as result;
