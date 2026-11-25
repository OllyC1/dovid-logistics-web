-- Complete the customer approval continuation, multi-parcel capacity, automatic
-- waiting timer and website-enquiry notification workflows. Production fleet
-- capacity still requires a real registration, verified measurements and an
-- assigned active rider; this migration does not create test motorcycles.

alter table public.notifications
  alter column customer_id drop not null;

comment on column public.notifications.customer_id is
  'Owning customer when applicable. Null is allowed for guest operational and website-enquiry email.';

create table public.availability_request_access_tokens (
  id uuid primary key default gen_random_uuid(),
  availability_request_id uuid not null references public.delivery_availability_requests(id) on delete restrict,
  token_hash text not null unique,
  expires_at timestamptz not null,
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  check (expires_at > created_at)
);

create index availability_request_access_tokens_request_idx
  on public.availability_request_access_tokens(availability_request_id,expires_at desc);
create index availability_request_access_tokens_expiry_idx
  on public.availability_request_access_tokens(expires_at)
  where last_used_at is null;

alter table public.availability_request_access_tokens enable row level security;
revoke all on public.availability_request_access_tokens from public,anon,authenticated;
grant select,insert,update on public.availability_request_access_tokens to service_role;

alter table public.fleet_vehicles
  drop constraint if exists fleet_vehicles_max_active_assignments_check,
  add constraint fleet_vehicles_max_active_assignments_check
    check (max_active_assignments between 1 and 10);

create or replace function public.assign_delivery_order(
  target_order_id uuid,
  target_vehicle_id uuid,
  target_rider_id uuid,
  actor_id uuid,
  score_snapshot jsonb,
  override_reason text default null
) returns uuid
language plpgsql security definer set search_path=public as $$
declare selected_vehicle public.fleet_vehicles%rowtype;
declare selected_order public.delivery_orders%rowtype;
declare assignment_id uuid;
declare rider_capacity integer;
declare effective_capacity integer;
declare vehicle_workload integer;
declare rider_workload integer;
begin
  if not exists(select 1 from public.profiles p join public.staff_memberships m on m.user_id=p.id and m.status='active' and m.staff_role in ('admin','super_admin') where p.id=actor_id and p.role='admin') then raise exception 'active admin authorization required'; end if;
  if not exists(select 1 from public.profiles p join public.staff_memberships m on m.user_id=p.id and m.status='active' and m.staff_role='rider' where p.id=target_rider_id and p.role='rider') then raise exception 'active rider profile required'; end if;
  select * into selected_order from public.delivery_orders where id=target_order_id for update;
  if not found then raise exception 'delivery order not found'; end if;
  if selected_order.delivery_status<>'awaiting_assignment' then raise exception 'order is not awaiting assignment'; end if;
  select * into selected_vehicle from public.fleet_vehicles where id=target_vehicle_id for update;
  if not found
    or selected_vehicle.operational_status not in ('available','assigned')
    or selected_vehicle.safety_status<>'cleared'
    or selected_vehicle.capacity_verified_at is null
    or selected_vehicle.registration_number is null
    or selected_vehicle.registration_number ~* '^PENDING([- ]|$)'
  then raise exception 'vehicle is not safely available'; end if;
  select coalesce(max_active_assignments_per_rider,1) into rider_capacity
  from public.service_area_operational_settings
  where service_area_id=(select service_area_id from public.service_zones where id=selected_order.pickup_zone_id);
  effective_capacity:=least(selected_vehicle.max_active_assignments,coalesce(rider_capacity,1));
  select count(*) into vehicle_workload from public.delivery_assignments where vehicle_id=target_vehicle_id and released_at is null;
  select count(*) into rider_workload from public.delivery_assignments where rider_id=target_rider_id and released_at is null;
  if vehicle_workload>=effective_capacity then raise exception 'vehicle parcel-count capacity exceeded (% active of %)',vehicle_workload,effective_capacity; end if;
  if rider_workload>=coalesce(rider_capacity,1) then raise exception 'rider capacity conflict (% active of %)',rider_workload,coalesce(rider_capacity,1); end if;
  if selected_vehicle.assigned_rider_id is distinct from target_rider_id and length(trim(coalesce(override_reason,'')))<8 then raise exception 'administrator override reason required'; end if;
  insert into public.delivery_assignments(order_id,vehicle_id,rider_id,assigned_by,score_snapshot,administrator_override,override_reason)
  values(target_order_id,target_vehicle_id,target_rider_id,actor_id,
    coalesce(score_snapshot,'{}'::jsonb)||jsonb_build_object('vehicleWorkloadBefore',vehicle_workload,'riderWorkloadBefore',rider_workload,'effectiveCapacity',effective_capacity),
    selected_vehicle.assigned_rider_id is distinct from target_rider_id,override_reason)
  returning id into assignment_id;
  update public.delivery_orders set rider_id=target_rider_id,delivery_status='assigned',updated_at=now() where id=target_order_id;
  update public.fleet_vehicles set operational_status='assigned',updated_at=now() where id=target_vehicle_id;
  insert into public.delivery_status_events(order_id,previous_status,new_status,actor_id,actor_type,metadata)
  values(target_order_id,'awaiting_assignment','assigned',actor_id,'admin',jsonb_build_object('assignmentId',assignment_id,'vehicleId',target_vehicle_id,'overrideReason',override_reason));
  return assignment_id;
end;
$$;

revoke all on function public.assign_delivery_order(uuid,uuid,uuid,uuid,jsonb,text) from public,anon,authenticated;
grant execute on function public.assign_delivery_order(uuid,uuid,uuid,uuid,jsonb,text) to service_role;

create or replace function public.auto_assign_delivery_order(target_order_id uuid)
returns uuid
language plpgsql security definer set search_path=public as $$
declare actor_id uuid;
declare selected_vehicle public.fleet_vehicles%rowtype;
declare assignment_id uuid;
declare selected_order public.delivery_orders%rowtype;
begin
  select * into selected_order from public.delivery_orders where id=target_order_id for update;
  if not found or selected_order.delivery_status<>'awaiting_assignment' then return null; end if;
  select p.id into actor_id
  from public.profiles p
  join public.staff_memberships m on m.user_id=p.id and m.status='active' and m.staff_role in ('admin','super_admin')
  where p.role='admin'
  order by p.created_at limit 1;
  if actor_id is null then return null; end if;

  select v.* into selected_vehicle
  from public.fleet_vehicles v
  join public.staff_memberships rider_membership
    on rider_membership.user_id=v.assigned_rider_id
   and rider_membership.staff_role='rider'
   and rider_membership.status='active'
  join public.profiles rider_profile on rider_profile.id=v.assigned_rider_id and rider_profile.role='rider'
  left join lateral (
    select count(*)::integer as workload
    from public.delivery_assignments active
    where active.vehicle_id=v.id and active.released_at is null
  ) load on true
  left join lateral (
    select count(*)::integer as workload
    from public.delivery_assignments active
    where active.rider_id=v.assigned_rider_id and active.released_at is null
  ) rider_load on true
  where v.operational_status in ('available','assigned')
    and v.safety_status='cleared'
    and v.capacity_verified_at is not null
    and v.registration_number is not null
    and v.registration_number !~* '^PENDING([- ]|$)'
    and coalesce(load.workload,0) < least(
      v.max_active_assignments,
      coalesce((select max_active_assignments_per_rider
        from public.service_area_operational_settings settings
        where settings.service_area_id=(select service_area_id from public.service_zones where id=selected_order.pickup_zone_id)),1)
    )
    and coalesce(rider_load.workload,0) < coalesce((select max_active_assignments_per_rider
      from public.service_area_operational_settings settings
      where settings.service_area_id=(select service_area_id from public.service_zones where id=selected_order.pickup_zone_id)),1)
  order by greatest(coalesce(load.workload,0),coalesce(rider_load.workload,0)),v.created_at
  for update of v skip locked
  limit 1;

  if selected_vehicle.id is null then
    insert into public.notifications(customer_id,order_id,channel,event_type,title,body,deduplication_key,status,next_attempt_at)
    select p.id,selected_order.id,'in_app','dispatch_assignment_needed','Rider assignment needed',
      'A new delivery is waiting for rider assignment: '||selected_order.order_reference,
      'dispatch-assignment-needed:'||selected_order.id||':'||p.id,'queued',now()
    from public.profiles p where p.role='admin'
    on conflict(deduplication_key) do nothing;
    return null;
  end if;

  assignment_id:=public.assign_delivery_order(
    selected_order.id,selected_vehicle.id,selected_vehicle.assigned_rider_id,actor_id,
    jsonb_build_object('source','automatic','vehicleId',selected_vehicle.id),null
  );
  insert into public.notifications(customer_id,order_id,channel,event_type,title,body,deduplication_key,status,next_attempt_at)
  values(selected_vehicle.assigned_rider_id,selected_order.id,'in_app','rider_assignment','New delivery assigned',
    'Delivery '||selected_order.order_reference||' is assigned to you. Pickup: '||selected_order.pickup_address||'. Payment status: '||selected_order.payment_status||'.',
    'rider-assignment:'||selected_order.id,'queued',now())
  on conflict(deduplication_key) do nothing;
  return assignment_id;
end;
$$;

revoke all on function public.auto_assign_delivery_order(uuid) from public,anon,authenticated;
grant execute on function public.auto_assign_delivery_order(uuid) to service_role;

create or replace function public.report_delivery_expense(
  target_order_id uuid,
  target_run_id uuid,
  actor_id uuid,
  expense_category text,
  expense_amount_kobo integer,
  expense_description text,
  expense_location jsonb,
  expense_occurred_at timestamptz,
  receipt_path text,
  cost_already_incurred boolean,
  customer_approval boolean,
  request_idempotency_key uuid
) returns uuid
language plpgsql security definer set search_path=public as $$
declare created_id uuid;
declare selected_order public.delivery_orders%rowtype;
begin
  select id into created_id from public.delivery_expense_reports where rider_id=actor_id and idempotency_key=request_idempotency_key;
  if found then return created_id; end if;
  if not exists(
    select 1 from public.profiles p
    left join public.staff_memberships m on m.user_id=p.id and m.status='active'
    where p.id=actor_id and ((p.role='rider' and m.staff_role='rider') or (p.role='admin' and m.staff_role in ('admin','super_admin')))
  ) then raise exception 'active rider or admin authorization required'; end if;
  select * into selected_order from public.delivery_orders where id=target_order_id for update;
  if not found then raise exception 'delivery order not found'; end if;
  if selected_order.rider_id is distinct from actor_id and not exists(select 1 from public.profiles where id=actor_id and role='admin') then raise exception 'order is not assigned to this rider'; end if;
  if selected_order.delivery_status in ('delivered','cancelled') then raise exception 'completed delivery cannot accept a new expense'; end if;
  insert into public.delivery_expense_reports(order_id,run_id,rider_id,category,amount_kobo,description,location,occurred_at,receipt_storage_path,already_incurred,customer_approval_obtained,idempotency_key)
  values(target_order_id,target_run_id,actor_id,expense_category,expense_amount_kobo,expense_description,expense_location,expense_occurred_at,receipt_path,cost_already_incurred,customer_approval,request_idempotency_key)
  returning id into created_id;
  return created_id;
end;
$$;

revoke all on function public.report_delivery_expense(uuid,uuid,uuid,text,integer,text,jsonb,timestamptz,text,boolean,boolean,uuid) from public,anon,authenticated;
grant execute on function public.report_delivery_expense(uuid,uuid,uuid,text,integer,text,jsonb,timestamptz,text,boolean,boolean,uuid) to service_role;

create or replace function public.record_delivery_attempt(
  target_order_id uuid,
  target_run_id uuid,
  actor_id uuid,
  attempt_status text,
  contact_attempts_payload jsonb,
  waiting_seconds integer,
  failure_reason_text text,
  evidence_payload jsonb,
  location_payload jsonb,
  rider_notes_text text,
  request_idempotency_key uuid
) returns uuid
language plpgsql security definer set search_path=public as $$
declare created_id uuid;
declare next_attempt integer;
declare selected_order public.delivery_orders%rowtype;
begin
  select id into created_id from public.delivery_attempts where rider_id=actor_id and idempotency_key=request_idempotency_key;
  if found then return created_id; end if;
  if not exists(
    select 1 from public.profiles p
    left join public.staff_memberships m on m.user_id=p.id and m.status='active'
    where p.id=actor_id and ((p.role='rider' and m.staff_role='rider') or (p.role='admin' and m.staff_role in ('admin','super_admin')))
  ) then raise exception 'active rider or admin authorization required'; end if;
  select * into selected_order from public.delivery_orders where id=target_order_id for update;
  if not found then raise exception 'delivery order not found'; end if;
  if selected_order.rider_id is distinct from actor_id and not exists(select 1 from public.profiles where id=actor_id and role='admin') then raise exception 'order is not assigned to this rider'; end if;
  if selected_order.delivery_status not in ('rider_en_route_to_pickup','picked_up','in_transit','arrived_at_destination','awaiting_payment') then raise exception 'delivery status does not allow a failed attempt'; end if;
  select coalesce(max(attempt_number),0)+1 into next_attempt from public.delivery_attempts where order_id=target_order_id;
  insert into public.delivery_attempts(order_id,run_id,rider_id,attempt_number,status,arrival_time,contact_attempts,waiting_duration_seconds,failure_reason,evidence,location,rider_notes,idempotency_key)
  values(target_order_id,target_run_id,actor_id,next_attempt,attempt_status,clock_timestamp(),contact_attempts_payload,waiting_seconds,failure_reason_text,evidence_payload,location_payload,rider_notes_text,request_idempotency_key)
  returning id into created_id;
  insert into public.parcel_custody_events(order_id,run_id,rider_id,event_type,evidence,notes,recorded_by,idempotency_key)
  values(target_order_id,target_run_id,actor_id,'delivery_failed',evidence_payload,rider_notes_text,actor_id,gen_random_uuid());
  perform public.transition_delivery_order(target_order_id,'delivery_failed',jsonb_build_object('source','delivery_attempt','attemptId',created_id,'actorUserId',actor_id,'actorRole',(select role::text from public.profiles where id=actor_id)));
  return created_id;
end;
$$;

revoke all on function public.record_delivery_attempt(uuid,uuid,uuid,text,jsonb,integer,text,jsonb,jsonb,text,uuid) from public,anon,authenticated;
grant execute on function public.record_delivery_attempt(uuid,uuid,uuid,text,jsonb,integer,text,jsonb,jsonb,text,uuid) to service_role;

create or replace function private.manage_automatic_waiting_session() returns trigger
language plpgsql security definer set search_path=public,private as $$
declare selected_area_id uuid;
declare selected_run_id uuid;
declare selected_waiting public.delivery_waiting_sessions%rowtype;
declare free_minutes integer;
declare fee_per_minute integer;
declare elapsed_seconds integer;
declare billable_minutes integer;
declare charge_kobo integer;
begin
  if new.delivery_status='arrived_at_destination' and new.delivery_status is distinct from old.delivery_status and new.rider_id is not null then
    select service_area_id into selected_area_id from public.service_zones where id=new.pickup_zone_id;
    select delivery_run_id into selected_run_id from public.delivery_assignments where order_id=new.id and released_at is null order by assigned_at desc limit 1;
    select waiting_free_minutes,waiting_fee_per_minute_kobo into free_minutes,fee_per_minute
    from public.service_area_operational_settings where service_area_id=selected_area_id;
    insert into public.delivery_waiting_sessions(
      order_id,run_id,rider_id,free_waiting_minutes_snapshot,fee_per_minute_kobo_snapshot,idempotency_key
    ) values(new.id,selected_run_id,new.rider_id,free_minutes,fee_per_minute,gen_random_uuid())
    on conflict do nothing;
  end if;

  if new.delivery_status in ('delivered','delivery_failed','cancelled') and new.delivery_status is distinct from old.delivery_status then
    select * into selected_waiting from public.delivery_waiting_sessions
    where order_id=new.id and status in ('running','paused') for update;
    if found then
      elapsed_seconds:=greatest(0,floor(extract(epoch from (clock_timestamp()-selected_waiting.started_at)))::integer-selected_waiting.excluded_seconds);
      if selected_waiting.free_waiting_minutes_snapshot is null or selected_waiting.fee_per_minute_kobo_snapshot is null then
        charge_kobo:=null;
      else
        billable_minutes:=ceil(greatest(0,elapsed_seconds-selected_waiting.free_waiting_minutes_snapshot*60)/60.0)::integer;
        charge_kobo:=billable_minutes*selected_waiting.fee_per_minute_kobo_snapshot;
      end if;
      update public.delivery_waiting_sessions
      set ended_at=clock_timestamp(),calculated_charge_kobo=charge_kobo,status='completed'
      where id=selected_waiting.id;
      if coalesce(charge_kobo,0)>0 then
        insert into public.delivery_expense_reports(
          order_id,run_id,rider_id,category,amount_kobo,description,occurred_at,
          already_incurred,customer_approval_obtained,idempotency_key
        ) values(
          selected_waiting.order_id,selected_waiting.run_id,selected_waiting.rider_id,'waiting_time',charge_kobo,
          'Server-calculated waiting time after the free waiting period',clock_timestamp(),false,false,selected_waiting.id
        ) on conflict(rider_id,idempotency_key) do nothing;
      end if;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists manage_automatic_waiting_session on public.delivery_orders;
create trigger manage_automatic_waiting_session
after update of delivery_status on public.delivery_orders
for each row execute function private.manage_automatic_waiting_session();

revoke all on function private.manage_automatic_waiting_session() from public,anon,authenticated;

create or replace function private.queue_website_enquiry_email() returns trigger
language plpgsql security definer set search_path=public,private as $$
declare enquiry_kind text;
declare support_subject text;
begin
  enquiry_kind:=case when tg_table_name='business_enquiries' then 'business' else 'support' end;
  support_subject:=case when enquiry_kind='business' then 'New business enquiry' else 'New website support enquiry' end;
  insert into public.notifications(
    customer_id,order_id,channel,event_type,title,subject,body,recipient_email,
    deduplication_key,status,delivery_status,priority,metadata,next_attempt_at
  ) values(
    null,null,'email','website_enquiry_received',support_subject,support_subject||': '||left(new.subject,120),
    'Name: '||new.name||E'\nEmail: '||new.email||E'\nPhone: '||coalesce(new.phone,'Not provided')||
      case when new.company_name is null then '' else E'\nBusiness: '||new.company_name end||
      E'\nSubject: '||new.subject||E'\n\nMessage:\n'||new.message,
    'hello@dovidlogistics.com','email:website-enquiry:internal:'||new.id,'queued','queued',95,
    jsonb_build_object('actionPath','/admin','enquiryId',new.id,'enquiryKind',enquiry_kind),now()
  ) on conflict(deduplication_key) do nothing;

  insert into public.notifications(
    customer_id,order_id,channel,event_type,title,subject,body,recipient_email,
    deduplication_key,status,delivery_status,priority,metadata,next_attempt_at
  ) values(
    null,null,'email','website_enquiry_acknowledged','We received your message','We received your Dovid Logistics enquiry',
    'Thank you for contacting Dovid Logistics. Our team has received your message about "'||left(new.subject,120)||'" and will reply using the contact details you provided.',
    lower(new.email),'email:website-enquiry:ack:'||new.id,'queued','queued',60,
    jsonb_build_object('actionPath','/contact','enquiryId',new.id,'enquiryKind',enquiry_kind),now()
  ) on conflict(deduplication_key) do nothing;
  return new;
end;
$$;

drop trigger if exists queue_support_enquiry_email on public.support_requests;
create trigger queue_support_enquiry_email
after insert on public.support_requests
for each row execute function private.queue_website_enquiry_email();

drop trigger if exists queue_business_enquiry_email on public.business_enquiries;
create trigger queue_business_enquiry_email
after insert on public.business_enquiries
for each row execute function private.queue_website_enquiry_email();

revoke all on function private.queue_website_enquiry_email() from public,anon,authenticated;
