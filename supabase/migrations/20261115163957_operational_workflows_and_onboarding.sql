-- Atomic operational workflows and audited privileged-role onboarding.
-- Remote migration version: 20261115163957.

create table public.privileged_role_assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete restrict,
  previous_role public.app_role not null,
  assigned_role public.app_role not null check (assigned_role in ('admin','rider')),
  assigned_by uuid not null references public.profiles(id) on delete restrict,
  verification_method text not null,
  verification_reference text not null,
  assignment_reason text not null,
  idempotency_key uuid not null unique,
  created_at timestamptz not null default now(),
  check (length(trim(verification_method)) >= 4),
  check (length(trim(verification_reference)) >= 4),
  check (length(trim(assignment_reason)) >= 8)
);

alter table public.privileged_role_assignments enable row level security;
create policy admin_privileged_role_assignments_read on public.privileged_role_assignments
for select to authenticated using (public.has_role('admin'));
revoke all on table public.privileged_role_assignments from public,anon,authenticated;
grant select on table public.privileged_role_assignments to authenticated;
grant all on table public.privileged_role_assignments to service_role;

create or replace function public.assign_verified_application_role(
  target_user_id uuid,
  target_role public.app_role,
  actor_id uuid,
  verification_method text,
  verification_reference text,
  assignment_reason text,
  request_idempotency_key uuid
) returns uuid
language plpgsql security definer set search_path=public,auth as $$
declare selected_profile public.profiles%rowtype;
declare created_assignment_id uuid;
begin
  select id into created_assignment_id from public.privileged_role_assignments where idempotency_key=request_idempotency_key;
  if found then return created_assignment_id; end if;
  if target_role not in ('admin','rider') then raise exception 'only privileged operational roles may be assigned'; end if;
  if length(trim(verification_method))<4 or length(trim(verification_reference))<4 or length(trim(assignment_reason))<8 then
    raise exception 'verified identity evidence and assignment reason are required';
  end if;
  if not exists(
    select 1 from auth.users
    where id=target_user_id and email_confirmed_at is not null and deleted_at is null
      and (banned_until is null or banned_until<=now())
  ) then raise exception 'target user must have a verified, active identity'; end if;
  select * into selected_profile from public.profiles where id=target_user_id for update;
  if not found then raise exception 'target profile not found'; end if;
  if not exists(select 1 from public.profiles where role='admin') then
    if target_role<>'admin' or actor_id<>target_user_id then raise exception 'initial administrator must be explicitly self-bootstrapped by the project owner'; end if;
  elsif not exists(select 1 from public.profiles where id=actor_id and role='admin') then
    raise exception 'administrator authorization required';
  end if;
  insert into public.privileged_role_assignments(user_id,previous_role,assigned_role,assigned_by,verification_method,verification_reference,assignment_reason,idempotency_key)
  values(target_user_id,selected_profile.role,target_role,actor_id,verification_method,verification_reference,assignment_reason,request_idempotency_key)
  returning id into created_assignment_id;
  update public.profiles set role=target_role,updated_at=now() where id=target_user_id;
  insert into public.audit_logs(actor_id,actor_type,action,resource_type,resource_id,metadata)
  values(actor_id,'admin','role.assigned','profile',target_user_id,jsonb_build_object('assignmentId',created_assignment_id,'previousRole',selected_profile.role,'assignedRole',target_role,'verificationMethod',verification_method));
  return created_assignment_id;
end;
$$;

alter table public.delivery_attempts add column resolution_idempotency_key uuid;
create unique index delivery_attempts_resolution_idempotency_idx on public.delivery_attempts(resolution_idempotency_key) where resolution_idempotency_key is not null;

create or replace function public.request_order_redelivery(
  target_order_id uuid,
  target_attempt_id uuid,
  actor_id uuid,
  corrected_address text,
  corrected_latitude numeric,
  corrected_longitude numeric,
  requested_schedule timestamptz,
  request_idempotency_key uuid
) returns jsonb
language plpgsql security definer set search_path=public as $$
declare created_request public.redelivery_requests%rowtype;
begin
  select * into created_request from public.redelivery_requests where idempotency_key=request_idempotency_key;
  if found then return jsonb_build_object('id',created_request.id,'status',created_request.status); end if;
  if not exists(select 1 from public.profiles where id=actor_id and role='customer') then raise exception 'customer authorization required'; end if;
  if not exists(select 1 from public.delivery_orders where id=target_order_id and customer_id=actor_id) then raise exception 'order not found'; end if;
  if not exists(select 1 from public.delivery_attempts where id=target_attempt_id and order_id=target_order_id) then raise exception 'delivery attempt not found'; end if;
  insert into public.redelivery_requests(order_id,delivery_attempt_id,requested_by,requested_by_role,status,corrected_address,corrected_latitude,corrected_longitude,scheduled_at,charge_attribution,idempotency_key)
  values(target_order_id,target_attempt_id,actor_id,'customer','requested',corrected_address,corrected_latitude,corrected_longitude,requested_schedule,'under_review',request_idempotency_key)
  returning * into created_request;
  insert into public.audit_logs(actor_id,actor_type,action,resource_type,resource_id,metadata)
  values(actor_id,'customer','redelivery.requested','delivery_order',target_order_id,jsonb_build_object('redeliveryRequestId',created_request.id,'attemptId',target_attempt_id));
  return jsonb_build_object('id',created_request.id,'status',created_request.status);
end;
$$;

create or replace function public.resolve_delivery_attempt(
  target_attempt_id uuid,
  actor_id uuid,
  resolution text,
  attributable_to text,
  resolution_reason text,
  requested_schedule timestamptz,
  corrected_address text,
  corrected_latitude numeric,
  corrected_longitude numeric,
  request_idempotency_key uuid
) returns jsonb
language plpgsql security definer set search_path=public as $$
declare selected_attempt public.delivery_attempts%rowtype;
declare selected_order public.delivery_orders%rowtype;
declare created_redelivery_id uuid;
declare created_incident_id uuid;
begin
  if not exists(select 1 from public.profiles where id=actor_id and role='admin') then raise exception 'admin authorization required'; end if;
  if resolution not in ('retry_immediately','schedule_redelivery','correct_address','return_to_sender','authorized_hold','open_incident','cancel') then raise exception 'invalid attempt resolution'; end if;
  if attributable_to not in ('customer','dovid','under_review') or length(trim(resolution_reason))<8 then raise exception 'complete resolution evidence is required'; end if;
  select * into selected_attempt from public.delivery_attempts where id=target_attempt_id for update;
  if not found then raise exception 'delivery attempt not found'; end if;
  if selected_attempt.resolution_idempotency_key=request_idempotency_key then
    select id into created_redelivery_id from public.redelivery_requests where delivery_attempt_id=target_attempt_id and idempotency_key=request_idempotency_key;
    select id into created_incident_id from public.delivery_incidents where attempt_id=target_attempt_id and idempotency_key=request_idempotency_key;
    return jsonb_build_object('resolution',selected_attempt.admin_decision,'redeliveryRequestId',created_redelivery_id,'incidentId',created_incident_id);
  end if;
  if selected_attempt.admin_decision is not null then raise exception 'delivery attempt already resolved'; end if;
  if resolution='correct_address' and length(trim(coalesce(corrected_address,'')))<8 then raise exception 'reviewed corrected address required'; end if;
  select * into selected_order from public.delivery_orders where id=selected_attempt.order_id for update;
  update public.delivery_attempts set admin_decision=resolution,admin_decided_by=actor_id,admin_decided_at=now(),customer_notification_status='queued',resolution_idempotency_key=request_idempotency_key where id=target_attempt_id;
  if resolution in ('schedule_redelivery','correct_address') then
    insert into public.redelivery_requests(order_id,delivery_attempt_id,requested_by,requested_by_role,status,corrected_address,corrected_latitude,corrected_longitude,scheduled_at,charge_attribution,decision_reason,idempotency_key)
    values(selected_attempt.order_id,selected_attempt.id,actor_id,'admin',case when requested_schedule is null then 'requested' else 'scheduled' end,corrected_address,corrected_latitude,corrected_longitude,requested_schedule,attributable_to,resolution_reason,request_idempotency_key)
    returning id into created_redelivery_id;
  end if;
  if resolution in ('retry_immediately','schedule_redelivery','correct_address') and selected_order.delivery_status='delivery_failed' then
    perform public.transition_delivery_order(selected_order.id,'awaiting_assignment',jsonb_build_object('source','attempt_resolution','actorUserId',actor_id,'actorRole','admin','resolution',resolution));
  end if;
  if resolution='return_to_sender' then
    update public.run_assignments set status='returning',released_at=null where order_id=selected_attempt.order_id and status='failed';
    insert into public.parcel_custody_events(order_id,run_id,rider_id,event_type,evidence,notes,recorded_by,idempotency_key)
    values(selected_attempt.order_id,selected_attempt.run_id,selected_attempt.rider_id,'return_started',jsonb_build_object('attemptId',selected_attempt.id),resolution_reason,actor_id,request_idempotency_key);
    if selected_attempt.run_id is not null then
      insert into public.delivery_run_stops(run_id,order_id,stop_type,sequence,status,address,latitude,longitude,adjustment_reason)
      values(selected_attempt.run_id,selected_attempt.order_id,'return_to_sender',2147480000,'pending',selected_order.pickup_address,selected_order.pickup_latitude,selected_order.pickup_longitude,resolution_reason)
      on conflict (run_id,order_id,stop_type) do nothing;
    end if;
  end if;
  if resolution='open_incident' or selected_attempt.status='unsafe_delivery' then
    insert into public.delivery_incidents(order_id,run_id,attempt_id,reported_by,incident_type,severity,description,evidence,idempotency_key)
    values(selected_attempt.order_id,selected_attempt.run_id,selected_attempt.id,actor_id,case when selected_attempt.status='unsafe_delivery' then 'safety' else 'other' end,case when selected_attempt.status='unsafe_delivery' then 'high' else 'medium' end,resolution_reason,'{}',request_idempotency_key)
    returning id into created_incident_id;
  end if;
  insert into public.notifications(customer_id,order_id,channel,event_type,title,body,deduplication_key,status)
  values(selected_order.customer_id,selected_order.id,'in_app','delivery_attempt_resolved','Delivery update',case when resolution='return_to_sender' then 'Your parcel is being returned to the sender. Check the order page for updates.' else 'Dispatch has reviewed the delivery attempt. Check your order for the next step.' end,'attempt-resolution:'||selected_attempt.id,'queued')
  on conflict (deduplication_key) do nothing;
  insert into public.audit_logs(actor_id,actor_type,action,resource_type,resource_id,metadata)
  values(actor_id,'admin','delivery_attempt.resolved','delivery_order',selected_order.id,jsonb_build_object('attemptId',selected_attempt.id,'resolution',resolution,'redeliveryRequestId',created_redelivery_id,'incidentId',created_incident_id));
  return jsonb_build_object('resolution',resolution,'redeliveryRequestId',created_redelivery_id,'incidentId',created_incident_id);
end;
$$;

create or replace function public.complete_delivery_handover(
  target_order_id uuid,
  actor_id uuid,
  request_idempotency_key uuid
) returns void
language plpgsql security definer set search_path=public as $$
declare selected_order public.delivery_orders%rowtype;
declare selected_run_id uuid;
begin
  if exists(select 1 from public.parcel_custody_events where idempotency_key=request_idempotency_key and order_id=target_order_id and event_type='handover_completed') then return; end if;
  select * into selected_order from public.delivery_orders where id=target_order_id for update;
  if not found then raise exception 'order not found'; end if;
  if not exists(select 1 from public.profiles where id=actor_id and (role='admin' or (role='rider' and selected_order.rider_id=actor_id))) then raise exception 'assigned rider or admin authorization required'; end if;
  if not public.order_has_verified_payment_clearance(target_order_id) then raise exception 'payment clearance required'; end if;
  if not exists(select 1 from public.delivery_proofs where order_id=target_order_id and payment_clearance_verified) then raise exception 'proof of delivery and verified payment clearance are required'; end if;
  select run_id into selected_run_id from public.run_assignments where order_id=target_order_id and status in ('assigned','not_collected','collected','onboard') order by assigned_at desc limit 1;
  perform public.transition_delivery_order(target_order_id,'delivered',jsonb_build_object('source','verified_handover','actorUserId',actor_id,'actorRole',(select role::text from public.profiles where id=actor_id)));
  insert into public.parcel_custody_events(order_id,run_id,rider_id,event_type,evidence,recorded_by,idempotency_key)
  values(target_order_id,selected_run_id,selected_order.rider_id,'handover_completed',jsonb_build_object('paymentClearanceVerified',true),actor_id,request_idempotency_key);
  update public.delivery_run_stops set status='completed',completed_at=coalesce(completed_at,now()),updated_at=now() where run_id=selected_run_id and order_id=target_order_id and stop_type='dropoff';
end;
$$;

create or replace function public.complete_return_to_sender(
  target_order_id uuid,
  actor_id uuid,
  completion_evidence jsonb,
  request_idempotency_key uuid
) returns void
language plpgsql security definer set search_path=public as $$
declare selected_order public.delivery_orders%rowtype;
declare selected_assignment public.run_assignments%rowtype;
begin
  if exists(select 1 from public.parcel_custody_events where idempotency_key=request_idempotency_key and event_type='returned_to_sender') then return; end if;
  select * into selected_order from public.delivery_orders where id=target_order_id for update;
  select * into selected_assignment from public.run_assignments where order_id=target_order_id and status='returning' order by assigned_at desc limit 1 for update;
  if not found then raise exception 'return-to-sender workflow is not active'; end if;
  if not exists(select 1 from public.profiles where id=actor_id and (role='admin' or (role='rider' and selected_order.rider_id=actor_id))) then raise exception 'assigned rider or admin authorization required'; end if;
  if coalesce(completion_evidence->>'recipientName','')='' then raise exception 'return recipient evidence required'; end if;
  insert into public.parcel_custody_events(order_id,run_id,rider_id,event_type,evidence,recorded_by,idempotency_key)
  values(target_order_id,selected_assignment.run_id,selected_order.rider_id,'returned_to_sender',completion_evidence,actor_id,request_idempotency_key);
  update public.run_assignments set status='returned',released_at=now() where id=selected_assignment.id;
  update public.delivery_run_stops set status='completed',completed_at=coalesce(completed_at,now()),updated_at=now() where run_id=selected_assignment.run_id and order_id=target_order_id and stop_type='return_to_sender';
  if selected_order.delivery_status='delivery_failed' then
    perform public.transition_delivery_order(target_order_id,'cancelled',jsonb_build_object('source','return_to_sender','actorUserId',actor_id,'actorRole',(select role::text from public.profiles where id=actor_id)));
  end if;
end;
$$;

create or replace function public.complete_delivery_run(
  target_run_id uuid,
  actor_id uuid,
  completion_reason text,
  request_idempotency_key uuid
) returns void
language plpgsql security definer set search_path=public as $$
declare selected_run public.delivery_runs%rowtype;
declare previous_snapshot jsonb;
begin
  if not exists(select 1 from public.profiles where id=actor_id and role='admin') then raise exception 'admin authorization required'; end if;
  if length(trim(completion_reason))<8 then raise exception 'completion reason required'; end if;
  select * into selected_run from public.delivery_runs where id=target_run_id for update;
  if not found then raise exception 'delivery run not found'; end if;
  if selected_run.status='completed' and selected_run.route_snapshot->>'completionIdempotencyKey'=request_idempotency_key::text then return; end if;
  if selected_run.status not in ('planned','active','paused') then raise exception 'delivery run cannot be completed'; end if;
  if exists(select 1 from public.run_assignments where run_id=target_run_id and status not in ('delivered','returned','released')) then raise exception 'all parcel assignments must reach a terminal custody state'; end if;
  if exists(select 1 from public.delivery_run_stops where run_id=target_run_id and status not in ('completed','skipped')) then raise exception 'all run stops must be completed or explicitly skipped'; end if;
  if exists(select 1 from public.delivery_attempts where run_id=target_run_id and admin_decision is null) then raise exception 'unresolved delivery attempts block run completion'; end if;
  if exists(select 1 from public.run_assignments a where a.run_id=target_run_id and a.status='delivered' and not exists(select 1 from public.parcel_custody_events c where c.order_id=a.order_id and c.run_id=target_run_id and c.event_type='handover_completed')) then raise exception 'delivered parcels require completed custody records'; end if;
  if exists(select 1 from public.run_assignments a where a.run_id=target_run_id and a.status='returned' and not exists(select 1 from public.parcel_custody_events c where c.order_id=a.order_id and c.run_id=target_run_id and c.event_type='returned_to_sender')) then raise exception 'returned parcels require return custody records'; end if;
  previous_snapshot=to_jsonb(selected_run);
  update public.delivery_runs set status='completed',completed_at=coalesce(completed_at,now()),updated_at=now(),version=version+1,route_snapshot=route_snapshot||jsonb_build_object('completionIdempotencyKey',request_idempotency_key,'completionReason',completion_reason) where id=target_run_id;
  update public.fleet_vehicles set operational_status='available',updated_at=now() where id=selected_run.vehicle_id and operational_status='assigned';
  insert into public.delivery_run_change_history(run_id,action,previous_snapshot,next_snapshot,changed_by,change_reason)
  select target_run_id,'run_completed',previous_snapshot,to_jsonb(r),actor_id,completion_reason from public.delivery_runs r where r.id=target_run_id;
end;
$$;

create or replace function public.release_completed_assignment() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if new.delivery_status in ('delivered','delivery_failed','cancelled') and new.delivery_status is distinct from old.delivery_status then
    update public.delivery_assignments set released_at=now(),release_reason=new.delivery_status::text
    where order_id=new.id and released_at is null;
    update public.run_assignments
    set status=case when new.delivery_status='delivered' then 'delivered' when new.delivery_status='delivery_failed' then 'failed' else 'released' end,
        released_at=case when new.delivery_status in ('delivered','cancelled') then now() else released_at end
    where order_id=new.id and status in ('assigned','not_collected','collected','onboard','returning');
    update public.fleet_vehicles v set operational_status='available',updated_at=now()
    where v.id in (select da.vehicle_id from public.delivery_assignments da where da.order_id=new.id)
      and not exists(select 1 from public.delivery_assignments active where active.vehicle_id=v.id and active.released_at is null);
  end if;
  return new;
end;
$$;

revoke all on function public.assign_verified_application_role(uuid,public.app_role,uuid,text,text,text,uuid) from public,anon,authenticated;
revoke all on function public.request_order_redelivery(uuid,uuid,uuid,text,numeric,numeric,timestamptz,uuid) from public,anon,authenticated;
revoke all on function public.resolve_delivery_attempt(uuid,uuid,text,text,text,timestamptz,text,numeric,numeric,uuid) from public,anon,authenticated;
revoke all on function public.complete_delivery_handover(uuid,uuid,uuid) from public,anon,authenticated;
revoke all on function public.complete_return_to_sender(uuid,uuid,jsonb,uuid) from public,anon,authenticated;
revoke all on function public.complete_delivery_run(uuid,uuid,text,uuid) from public,anon,authenticated;
revoke all on function public.release_completed_assignment() from public,anon,authenticated;
grant execute on function public.assign_verified_application_role(uuid,public.app_role,uuid,text,text,text,uuid) to service_role;
grant execute on function public.request_order_redelivery(uuid,uuid,uuid,text,numeric,numeric,timestamptz,uuid) to service_role;
grant execute on function public.resolve_delivery_attempt(uuid,uuid,text,text,text,timestamptz,text,numeric,numeric,uuid) to service_role;
grant execute on function public.complete_delivery_handover(uuid,uuid,uuid) to service_role;
grant execute on function public.complete_return_to_sender(uuid,uuid,jsonb,uuid) to service_role;
grant execute on function public.complete_delivery_run(uuid,uuid,text,uuid) to service_role;
