\set ON_ERROR_STOP on

begin;

insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data)
values
  ('a1000000-0000-4000-8000-000000000001','admin-ops@example.test',now(),'{"full_name":"Admin Operations"}'),
  ('a1000000-0000-4000-8000-000000000002','rider-ops@example.test',now(),'{"full_name":"Rider Operations"}');

update public.profiles
set role='admin'
where id='a1000000-0000-4000-8000-000000000001';

update public.profiles
set role='rider'
where id='a1000000-0000-4000-8000-000000000002';

insert into public.staff_memberships(user_id,staff_role,status)
values
  ('a1000000-0000-4000-8000-000000000001','super_admin','active'),
  ('a1000000-0000-4000-8000-000000000002','rider','active');

insert into public.pricing_configurations(id,name,city,currency,timezone,active)
values ('a2000000-0000-4000-8000-000000000001','Admin operations validation','Ibadan','NGN','Africa/Lagos',false);

insert into public.pricing_configuration_versions(
  id,pricing_configuration_id,version,assumptions,status,effective_at,change_reason,created_by,updated_by
) values (
  'a2000000-0000-4000-8000-000000000002',
  'a2000000-0000-4000-8000-000000000001',
  1,
  '{}'::jsonb,
  'draft',
  now(),
  'Admin workflow validation',
  'a1000000-0000-4000-8000-000000000001',
  'a1000000-0000-4000-8000-000000000001'
);

insert into public.rate_cards(
  id,configuration_version_id,name,service_level,provisional,active,effective_at,created_by
) values (
  'a3000000-0000-4000-8000-000000000001',
  'a2000000-0000-4000-8000-000000000002',
  'Unused draft validation',
  'standard',
  true,
  false,
  now(),
  'a1000000-0000-4000-8000-000000000001'
);

insert into public.rate_card_bands(
  rate_card_id,position,minimum_distance_meters,maximum_distance_meters,price_kobo
) values ('a3000000-0000-4000-8000-000000000001',0,0,5000,250000);

insert into public.promotions(
  id,code,kind,value,active,starts_at,eligibility,created_by
) values (
  'a4000000-0000-4000-8000-000000000001',
  'ADMINOPS100',
  'percentage',
  10000,
  false,
  now(),
  '{}'::jsonb,
  'a1000000-0000-4000-8000-000000000001'
);

do $$
begin
  if has_function_privilege('anon','public.update_staff_profile_record(uuid,uuid,text,text,text,text,text,text)','execute')
    or has_function_privilege('authenticated','public.update_staff_profile_record(uuid,uuid,text,text,text,text,text,text)','execute') then
    raise exception 'untrusted roles can update staff profiles through the privileged workflow';
  end if;
  if has_function_privilege('anon','public.delete_unused_rate_card_draft(uuid,uuid,text)','execute')
    or has_function_privilege('authenticated','public.delete_unused_rate_card_draft(uuid,uuid,text)','execute') then
    raise exception 'untrusted roles can delete rate card drafts through the privileged workflow';
  end if;
  if has_function_privilege('anon','public.set_promotion_active(uuid,uuid,boolean,text)','execute')
    or has_function_privilege('authenticated','public.set_promotion_active(uuid,uuid,boolean,text)','execute') then
    raise exception 'untrusted roles can activate promotions through the privileged workflow';
  end if;
end;
$$;

set role service_role;

select public.update_staff_profile_record(
  'a1000000-0000-4000-8000-000000000002',
  'a1000000-0000-4000-8000-000000000001',
  'Rider',
  'Operations',
  'Road Captain',
  'Rider Operations',
  '+2348012345678',
  'Validated staff identity details'
);

select * from public.set_promotion_active(
  'a4000000-0000-4000-8000-000000000001',
  'a1000000-0000-4000-8000-000000000001',
  true,
  'Validated controlled activation'
);

select public.delete_unused_rate_card_draft(
  'a3000000-0000-4000-8000-000000000001',
  'a1000000-0000-4000-8000-000000000001',
  'Validated unused draft deletion'
);

reset role;

do $$
begin
  if not exists(
    select 1 from public.profiles
    where id='a1000000-0000-4000-8000-000000000002'
      and first_name='Rider'
      and last_name='Operations'
      and preferred_name='Road Captain'
      and phone='+2348012345678'
  ) then
    raise exception 'staff profile workflow did not persist identity details';
  end if;
  if not exists(
    select 1 from public.promotions
    where id='a4000000-0000-4000-8000-000000000001' and active
  ) then
    raise exception 'promotion activation workflow did not update the promotion';
  end if;
  if exists(select 1 from public.rate_cards where id='a3000000-0000-4000-8000-000000000001')
    or exists(select 1 from public.rate_card_bands where rate_card_id='a3000000-0000-4000-8000-000000000001') then
    raise exception 'unused draft deletion did not remove the card and its bands';
  end if;
  if (
    select count(*) from public.audit_logs
    where actor_id='a1000000-0000-4000-8000-000000000001'
      and action in ('staff.profile.updated','promotion.activated','rate_card.draft_deleted')
  ) <> 3 then
    raise exception 'admin workflows did not write all expected audit records';
  end if;
end;
$$;

rollback;
