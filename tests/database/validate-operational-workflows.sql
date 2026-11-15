\set ON_ERROR_STOP on

begin;

insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data)
values('55555555-5555-4555-8555-555555555555','verified-rider@example.test',now(),'{"full_name":"Verified Rider"}');

do $$
declare first_assignment uuid;
declare retry_assignment uuid;
begin
  first_assignment:=public.assign_verified_application_role(
    '55555555-5555-4555-8555-555555555555','rider','44444444-4444-4444-4444-444444444444',
    'founder_review','TEST-RIDER-APPROVAL','Verified rider onboarding validation','81000000-0000-4000-8000-000000000001'
  );
  retry_assignment:=public.assign_verified_application_role(
    '55555555-5555-4555-8555-555555555555','rider','44444444-4444-4444-4444-444444444444',
    'founder_review','TEST-RIDER-APPROVAL','Verified rider onboarding validation','81000000-0000-4000-8000-000000000001'
  );
  if first_assignment is distinct from retry_assignment then raise exception 'role assignment retry was not idempotent'; end if;
  if (select role from public.profiles where id='55555555-5555-4555-8555-555555555555')<>'rider' then raise exception 'verified rider role was not assigned'; end if;
  if has_function_privilege('authenticated','public.assign_verified_application_role(uuid,public.app_role,uuid,text,text,text,uuid)','execute') then raise exception 'authenticated client can assign privileged roles'; end if;
  if has_function_privilege('authenticated','public.complete_delivery_run(uuid,uuid,text,uuid)','execute') then raise exception 'authenticated client can complete delivery runs directly'; end if;
end;
$$;

insert into public.delivery_runs(id,run_reference,rider_id,vehicle_id,status,idempotency_key,created_by,compliance_confirmed_at,compliance_confirmed_by,compliance_notes)
values('81000000-0000-4000-8000-000000000010','RUN-WORKFLOW-VALIDATION','33333333-3333-3333-3333-333333333333','20000000-0000-4000-8000-000000000001','planned','81000000-0000-4000-8000-000000000011','44444444-4444-4444-4444-444444444444',now(),'44444444-4444-4444-4444-444444444444','Workflow completion validation');

insert into public.delivery_run_stops(id,run_id,order_id,stop_type,sequence,status,address)
values('81000000-0000-4000-8000-000000000012','81000000-0000-4000-8000-000000000010','cccccccc-cccc-cccc-cccc-cccccccccccc','dropoff',1,'pending','Validation destination');

insert into public.run_assignments(id,run_id,order_id,status,idempotency_key)
values('81000000-0000-4000-8000-000000000013','81000000-0000-4000-8000-000000000010','cccccccc-cccc-cccc-cccc-cccccccccccc','assigned','81000000-0000-4000-8000-000000000014');

do $$
begin
  begin
    perform public.complete_delivery_run('81000000-0000-4000-8000-000000000010','44444444-4444-4444-4444-444444444444','Validated terminal custody state','81000000-0000-4000-8000-000000000015');
    raise exception 'active parcel assignment did not block run completion';
  exception when others then
    if sqlerrm<>'all parcel assignments must reach a terminal custody state' then raise; end if;
  end;
end;
$$;

update public.run_assignments set status='delivered',released_at=now() where id='81000000-0000-4000-8000-000000000013';
update public.delivery_run_stops set status='completed',completed_at=now() where id='81000000-0000-4000-8000-000000000012';

do $$
begin
  begin
    perform public.complete_delivery_run('81000000-0000-4000-8000-000000000010','44444444-4444-4444-4444-444444444444','Validated terminal custody state','81000000-0000-4000-8000-000000000015');
    raise exception 'missing custody evidence did not block run completion';
  exception when others then
    if sqlerrm<>'delivered parcels require completed custody records' then raise; end if;
  end;
end;
$$;

insert into public.parcel_custody_events(order_id,run_id,rider_id,event_type,evidence,recorded_by,idempotency_key)
values('cccccccc-cccc-cccc-cccc-cccccccccccc','81000000-0000-4000-8000-000000000010','33333333-3333-3333-3333-333333333333','handover_completed','{"paymentClearanceVerified":true}','33333333-3333-3333-3333-333333333333','81000000-0000-4000-8000-000000000016');

select public.complete_delivery_run('81000000-0000-4000-8000-000000000010','44444444-4444-4444-4444-444444444444','Validated terminal custody state','81000000-0000-4000-8000-000000000015');
select public.complete_delivery_run('81000000-0000-4000-8000-000000000010','44444444-4444-4444-4444-444444444444','Validated terminal custody state retry','81000000-0000-4000-8000-000000000015');

do $$
begin
  if (select status from public.delivery_runs where id='81000000-0000-4000-8000-000000000010')<>'completed' then raise exception 'delivery run was not completed'; end if;
  if (select count(*) from public.delivery_run_change_history where run_id='81000000-0000-4000-8000-000000000010' and action='run_completed')<>1 then raise exception 'run completion was not idempotent and audited exactly once'; end if;
end;
$$;

rollback;

select 'operational workflow validation passed' as result;
