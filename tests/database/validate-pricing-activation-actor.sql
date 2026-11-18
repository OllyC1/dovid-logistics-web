begin;

insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values(
  '10000000-0000-4000-8000-000000000004',
  'authenticated',
  'authenticated',
  'pricing-activation-validation@example.invalid',
  'not-a-real-password',
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"full_name":"Pricing Validation Admin"}'::jsonb,
  now(),
  now()
);

update public.profiles
set role='admin', full_name='Pricing Validation Admin'
where id='10000000-0000-4000-8000-000000000004';

insert into public.staff_memberships(user_id,staff_role,status)
values('10000000-0000-4000-8000-000000000004','super_admin','active');

insert into public.pricing_configurations(id,name,city,currency,timezone,active)
values('20000000-0000-4000-8000-000000000004','Validation pricing','Ibadan','NGN','Africa/Lagos',true);

insert into public.pricing_configuration_versions(
  id,pricing_configuration_id,version,assumptions,status,effective_at,change_reason,created_by
) values(
  '30000000-0000-4000-8000-000000000004',
  '20000000-0000-4000-8000-000000000004',
  1,
  '{}'::jsonb,
  'draft',
  now(),
  'Controlled activation validation',
  '10000000-0000-4000-8000-000000000004'
);

select public.activate_pricing_configuration_version(
  '30000000-0000-4000-8000-000000000004',
  'Founder approved the controlled pricing validation',
  '10000000-0000-4000-8000-000000000004'
);

do $$
begin
  if not exists(
    select 1 from public.pricing_configuration_versions
    where id='30000000-0000-4000-8000-000000000004'
      and status='active'
      and updated_by='10000000-0000-4000-8000-000000000004'
  ) then raise exception 'pricing version did not preserve the authorized actor'; end if;
  if not exists(
    select 1 from public.audit_logs
    where actor_id='10000000-0000-4000-8000-000000000004'
      and action='pricing.version.activated'
      and metadata->>'reason'='Founder approved the controlled pricing validation'
  ) then raise exception 'pricing version audit evidence missing'; end if;
end;
$$;

insert into public.rate_cards(
  id,configuration_version_id,name,service_level,provisional,active,effective_at,created_by
) values(
  '40000000-0000-4000-8000-000000000004',
  '30000000-0000-4000-8000-000000000004',
  'Validation standard card',
  'standard',
  false,
  false,
  now(),
  '10000000-0000-4000-8000-000000000004'
);

insert into public.rate_card_bands(rate_card_id,position,minimum_distance_meters,maximum_distance_meters,price_kobo)
values('40000000-0000-4000-8000-000000000004',0,0,null,250000);

select public.activate_rate_card(
  '40000000-0000-4000-8000-000000000004',
  '10000000-0000-4000-8000-000000000004',
  'Founder approved the controlled rate-card validation'
);

do $$
begin
  if not exists(
    select 1 from public.rate_cards
    where id='40000000-0000-4000-8000-000000000004' and active
  ) then raise exception 'rate card was not activated'; end if;
  if not exists(
    select 1 from public.audit_logs
    where actor_id='10000000-0000-4000-8000-000000000004'
      and action='pricing.rate_card.activated'
      and metadata->>'reason'='Founder approved the controlled rate-card validation'
  ) then raise exception 'rate card audit evidence missing'; end if;
  if has_function_privilege('authenticated','public.activate_rate_card(uuid,uuid,text)','EXECUTE') then
    raise exception 'authenticated users must not execute server-only rate-card activation';
  end if;
  if has_function_privilege('authenticated','public.activate_pricing_configuration_version(uuid,text,uuid)','EXECUTE') then
    raise exception 'authenticated users must not execute server-only pricing activation';
  end if;
end;
$$;

delete from public.staff_memberships
where user_id='10000000-0000-4000-8000-000000000004';

do $$
begin
  begin
    perform public.activate_rate_card(
      '40000000-0000-4000-8000-000000000004',
      '10000000-0000-4000-8000-000000000004',
      'This actor no longer has an active staff membership'
    );
    raise exception 'unauthorized pricing actor was accepted';
  exception when others then
    if sqlerrm='unauthorized pricing actor was accepted' then raise; end if;
    if sqlerrm not like '%authorization required%' then raise; end if;
  end;
end;
$$;

rollback;
