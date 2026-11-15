-- Additive concurrency and retry fixes discovered during clean validation.

alter table public.run_assignments drop constraint if exists run_assignments_order_id_key;
create unique index run_assignments_active_order_idx on public.run_assignments(order_id)
where status in ('assigned','not_collected','collected','onboard','returning');

create or replace function public.normalize_delivery_run_stop_sequence() returns trigger
language plpgsql set search_path=public as $$
begin
  if exists(select 1 from public.delivery_run_stops where run_id=new.run_id and sequence=new.sequence) then
    select coalesce(max(sequence),0)+1 into new.sequence from public.delivery_run_stops where run_id=new.run_id;
  end if;
  return new;
end;
$$;
create trigger delivery_run_stop_sequence_trigger
before insert on public.delivery_run_stops
for each row execute function public.normalize_delivery_run_stop_sequence();

create or replace function public.accept_assisted_quote(
  access_token_hash text,
  verification_session_hash text,
  actor_customer_id uuid,
  selected_payer public.payer_type,
  acceptance_idempotency uuid,
  acceptance_evidence jsonb
) returns jsonb
language plpgsql security definer set search_path=public,extensions as $$
declare selected_token public.assisted_quote_access_tokens%rowtype;
declare selected_draft public.assisted_booking_drafts%rowtype;
declare selected_quote public.quotes%rowtype;
declare accepted_payload jsonb;
begin
  if not exists(select 1 from public.profiles where id=actor_customer_id and role='customer') then raise exception 'customer authorization required'; end if;
  select * into selected_token from public.assisted_quote_access_tokens where token_hash=access_token_hash for update;
  if not found or selected_token.revoked_at is not null or selected_token.consumed_at is not null or selected_token.expires_at<=now() then raise exception 'quote link is invalid or expired'; end if;
  if selected_token.verified_at is null then raise exception 'contact verification is required'; end if;
  if selected_token.verification_session_hash is distinct from verification_session_hash or selected_token.verification_session_expires_at is null or selected_token.verification_session_expires_at<=now() then raise exception 'verified quote session has expired'; end if;
  select * into selected_draft from public.assisted_booking_drafts where id=selected_token.draft_id for update;
  select * into selected_quote from public.quotes where id=selected_draft.quote_id for update;
  if selected_token.acceptance_idempotency_key=acceptance_idempotency
    and selected_draft.status in ('accepted','order_created') and selected_quote.customer_id=actor_customer_id then
    return jsonb_build_object('draftId',selected_draft.id,'quoteId',selected_quote.id,'requestPayload',selected_draft.request_payload);
  end if;
  if selected_token.acceptance_idempotency_key is not null then raise exception 'quote link has already been accepted'; end if;
  if selected_draft.status not in ('quoted','awaiting_customer') then raise exception 'assisted booking is not awaiting acceptance'; end if;
  if not found or selected_quote.expires_at<=now() then raise exception 'quote has expired'; end if;
  if selected_draft.quote_payload_hash is distinct from encode(extensions.digest(selected_quote.request_payload::text,'sha256'),'hex') then raise exception 'quote details changed after link creation'; end if;
  if selected_quote.operational_approval_status not in ('not_required','approved') then raise exception 'dispatch approval is still required'; end if;
  accepted_payload:=jsonb_set(selected_draft.request_payload,'{payer}',to_jsonb(selected_payer::text),true);
  update public.quotes set customer_id=actor_customer_id,status='confirmed',confirmed_at=coalesce(confirmed_at,now()),confirmation_idempotency_key=acceptance_idempotency,request_payload=jsonb_set(request_payload,'{payer}',to_jsonb(selected_payer::text),true)
  where id=selected_quote.id and (customer_id is null or customer_id=actor_customer_id);
  if not found then raise exception 'quote belongs to another customer'; end if;
  update public.assisted_quote_access_tokens set acceptance_idempotency_key=acceptance_idempotency where id=selected_token.id;
  update public.assisted_booking_drafts set status='accepted',customer_id=actor_customer_id,accepted_by=actor_customer_id,accepted_at=coalesce(accepted_at,now()),acceptance_channel='secure_quote_link',terms_version=acceptance_evidence->>'termsVersion',affirmative_acceptance=acceptance_evidence,request_payload=accepted_payload,updated_at=now() where id=selected_draft.id;
  insert into public.assisted_booking_events(draft_id,event_type,actor_id,actor_type,metadata) values(selected_draft.id,'quote_accepted',actor_customer_id,'customer',acceptance_evidence);
  return jsonb_build_object('draftId',selected_draft.id,'quoteId',selected_quote.id,'requestPayload',accepted_payload);
end;
$$;

create or replace function public.reorder_delivery_run_stops(
  target_run_id uuid,
  ordered_stop_ids uuid[],
  actor_id uuid,
  change_reason text,
  request_idempotency_key uuid
) returns void
language plpgsql security definer set search_path=public as $$
declare selected_run public.delivery_runs%rowtype;
declare previous_snapshot jsonb;
begin
  if not exists(select 1 from public.profiles where id=actor_id and role='admin') then raise exception 'admin authorization required'; end if;
  if length(trim(change_reason))<8 then raise exception 'route adjustment reason required'; end if;
  select * into selected_run from public.delivery_runs where id=target_run_id for update;
  if not found or selected_run.status not in ('planned','active','paused') then raise exception 'delivery run cannot be adjusted'; end if;
  if cardinality(ordered_stop_ids)<>(select count(*) from public.delivery_run_stops where run_id=target_run_id and status in ('pending','next')) then raise exception 'all pending stops must be included exactly once'; end if;
  if (select count(distinct value) from unnest(ordered_stop_ids) value)<>cardinality(ordered_stop_ids) then raise exception 'duplicate stop in route order'; end if;
  if exists(select 1 from unnest(ordered_stop_ids) value where not exists(select 1 from public.delivery_run_stops s where s.id=value and s.run_id=target_run_id and s.status in ('pending','next'))) then raise exception 'route contains an invalid stop'; end if;
  if exists(
    select 1 from public.delivery_run_stops pickup join public.delivery_run_stops dropoff on dropoff.run_id=pickup.run_id and dropoff.order_id=pickup.order_id and dropoff.stop_type='dropoff'
    where pickup.run_id=target_run_id and pickup.stop_type='pickup'
      and array_position(ordered_stop_ids,pickup.id)>array_position(ordered_stop_ids,dropoff.id)
  ) then raise exception 'pickup must remain before drop-off'; end if;
  select jsonb_agg(to_jsonb(s) order by s.sequence) into previous_snapshot from public.delivery_run_stops s where s.run_id=target_run_id;
  update public.delivery_run_stops set sequence=sequence+10000 where run_id=target_run_id and status in ('pending','next');
  update public.delivery_run_stops s set sequence=ordered.position,manually_adjusted=true,adjustment_reason=change_reason,updated_at=now()
  from unnest(ordered_stop_ids) with ordinality ordered(id,position) where s.id=ordered.id;
  update public.delivery_runs set version=version+1,updated_at=now(),route_snapshot=route_snapshot||jsonb_build_object('manualOrder',ordered_stop_ids,'adjustedAt',now(),'idempotencyKey',request_idempotency_key) where id=target_run_id;
  insert into public.delivery_run_change_history(run_id,action,previous_snapshot,next_snapshot,changed_by,change_reason)
  select target_run_id,'manual_route_reorder',previous_snapshot,jsonb_agg(to_jsonb(s) order by s.sequence),actor_id,change_reason from public.delivery_run_stops s where s.run_id=target_run_id;
end;
$$;

revoke all on function public.normalize_delivery_run_stop_sequence() from public,anon,authenticated;
revoke all on function public.accept_assisted_quote(text,text,uuid,public.payer_type,uuid,jsonb) from public,anon,authenticated;
revoke all on function public.reorder_delivery_run_stops(uuid,uuid[],uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.accept_assisted_quote(text,text,uuid,public.payer_type,uuid,jsonb) to service_role;
grant execute on function public.reorder_delivery_run_stops(uuid,uuid[],uuid,text,uuid) to service_role;

