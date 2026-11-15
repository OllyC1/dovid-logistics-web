alter table public.payment_intents
  add column if not exists idempotency_key uuid,
  add column if not exists last_provider_status text,
  add column if not exists last_verified_at timestamptz,
  add column if not exists refunded_amount_minor integer not null default 0 check (refunded_amount_minor >= 0),
  add column if not exists dispute_status text check (dispute_status is null or dispute_status in ('open','reminded','resolved')),
  add column if not exists disputed_at timestamptz;

do $$
begin
  if exists(
    select 1 from public.payment_intents
    where idempotency_key is not null
    group by idempotency_key having count(*)>1
  ) then raise exception 'duplicate payment intent idempotency keys must be resolved before migration'; end if;
  if exists(
    select 1 from public.payment_intents
    where surcharge_id is null and status in ('pending','processing')
    group by order_id having count(*)>1
  ) then raise exception 'duplicate active main payment intents must be resolved before migration'; end if;
end;
$$;

create unique index if not exists payment_intents_idempotency_idx on public.payment_intents(idempotency_key) where idempotency_key is not null;
create unique index if not exists payment_intents_active_main_order_idx on public.payment_intents(order_id)
  where surcharge_id is null and status in ('pending','processing');

alter table public.customer_surcharges
  add column if not exists mandatory_for_handover boolean not null default true,
  add column if not exists refunded_amount_kobo integer not null default 0 check (refunded_amount_kobo >= 0);

do $$
begin
  if exists(select 1 from public.customer_surcharges where status not in ('proposed','customer_approved','payment_pending','paid','rejected','disputed','waived','refund_pending','partially_refunded','refunded')) then
    raise exception 'unsupported customer surcharge status must be resolved before migration';
  end if;
  if exists(select 1 from public.customer_surcharges where category not in ('toll_road_access','authorized_parking_access','waiting_time','extra_stop','address_correction','return_journey','redelivery','other')) then
    raise exception 'unsupported customer surcharge category must be resolved before migration';
  end if;
  if exists(
    select 1 from public.payment_reconciliations
    where external_reference is not null
    group by payment_intent_id,reconciliation_type,external_reference having count(*)>1
  ) then raise exception 'duplicate payment reconciliation references must be resolved before migration'; end if;
end;
$$;

alter table public.customer_surcharges drop constraint if exists customer_surcharges_status_check;
alter table public.customer_surcharges add constraint customer_surcharges_status_check
  check (status in ('proposed','customer_approved','payment_pending','paid','rejected','disputed','waived','refund_pending','partially_refunded','refunded'));

alter table public.customer_surcharges drop constraint if exists customer_surcharges_category_check;
alter table public.customer_surcharges add constraint customer_surcharges_category_check
  check (category in ('toll_road_access','authorized_parking_access','waiting_time','extra_stop','address_correction','return_journey','redelivery','other'));

create unique index if not exists payment_reconciliations_external_reference_idx
  on public.payment_reconciliations(payment_intent_id,reconciliation_type,external_reference)
  where external_reference is not null;

create table public.payment_refunds (
  id uuid primary key default gen_random_uuid(),
  payment_intent_id uuid not null references public.payment_intents(id) on delete restrict,
  provider_refund_id text not null,
  amount_minor integer not null check (amount_minor > 0),
  currency char(3) not null,
  status text not null check (status in ('pending','processing','needs_attention','failed','processed')),
  immutable_payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(payment_intent_id,provider_refund_id)
);

create table public.payment_disputes (
  id uuid primary key default gen_random_uuid(),
  payment_intent_id uuid not null references public.payment_intents(id) on delete restrict,
  provider_dispute_id text not null,
  amount_minor integer,
  currency char(3),
  status text not null check (status in ('open','reminded','resolved')),
  immutable_payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(payment_intent_id,provider_dispute_id)
);

alter table public.payment_refunds enable row level security;
alter table public.payment_disputes enable row level security;
create policy payment_refunds_client_deny on public.payment_refunds for all to anon,authenticated using (false) with check (false);
create policy payment_disputes_client_deny on public.payment_disputes for all to anon,authenticated using (false) with check (false);
revoke all on public.payment_refunds,public.payment_disputes from anon,authenticated;

create or replace function public.record_verified_payment(payment_intent_id uuid, provider_transaction_id text, event_payload jsonb) returns void
language plpgsql security definer set search_path=public as $$
declare selected_intent public.payment_intents%rowtype;
declare provider_amount integer;
declare provider_currency text;
declare receiver_token_id uuid;
begin
  select * into selected_intent from public.payment_intents where id=$1 for update;
  if not found then raise exception 'payment intent not found'; end if;
  if selected_intent.status in ('paid','refunded','partially_refunded') then return; end if;
  provider_amount := nullif(event_payload#>>'{data,amount}','')::integer;
  provider_currency := nullif(event_payload#>>'{data,currency}','');
  if provider_amount is null or provider_amount<>selected_intent.amount_minor then raise exception 'payment amount mismatch'; end if;
  if provider_currency is null or provider_currency<>selected_intent.currency then raise exception 'payment currency mismatch'; end if;
  insert into public.payment_transactions(payment_intent_id,order_id,provider_transaction_id,amount_minor,currency,status,immutable_payload)
  values(selected_intent.id,selected_intent.order_id,$2,selected_intent.amount_minor,selected_intent.currency,'paid',$3)
  on conflict on constraint payment_transactions_payment_intent_id_provider_transaction_key do nothing;
  update public.payment_intents set status='paid',last_provider_status='success',last_verified_at=now(),updated_at=now() where id=selected_intent.id;
  if selected_intent.surcharge_id is null then
    update public.delivery_orders set payment_status='paid',updated_at=now() where id=selected_intent.order_id;
    receiver_token_id := nullif(event_payload#>>'{data,metadata,receiver_token_id}','')::uuid;
    if receiver_token_id is not null then update public.receiver_payment_tokens set consumed_at=coalesce(consumed_at,now()) where id=receiver_token_id and order_id=selected_intent.order_id; end if;
  else
    update public.customer_surcharges set status='paid',refunded_amount_kobo=0,updated_at=now()
    where id=selected_intent.surcharge_id and status in ('customer_approved','payment_pending');
  end if;
  insert into public.audit_logs(actor_type,action,resource_type,resource_id,metadata)
  values('system','payment.verified','delivery_order',selected_intent.order_id,jsonb_build_object('payment_intent_id',selected_intent.id,'provider_transaction_id',$2));
end;
$$;

create or replace function public.record_payment_provider_state(payment_intent_id uuid, provider_status text, event_payload jsonb) returns void
language plpgsql security definer set search_path=public as $$
declare selected_intent public.payment_intents%rowtype;
declare next_status public.payment_status;
begin
  select * into selected_intent from public.payment_intents where id=$1 for update;
  if not found then raise exception 'payment intent not found'; end if;
  if selected_intent.status in ('paid','refunded','partially_refunded') then return; end if;
  next_status := case when $2 in ('failed','abandoned') then 'failed'::public.payment_status else 'processing'::public.payment_status end;
  update public.payment_intents set status=next_status,last_provider_status=$2,last_verified_at=now(),updated_at=now() where id=selected_intent.id;
  if selected_intent.surcharge_id is null then
    update public.delivery_orders set payment_status=next_status,updated_at=now() where id=selected_intent.order_id and payment_status<>'paid';
  end if;
  insert into public.audit_logs(actor_type,action,resource_type,resource_id,metadata)
  values('system','payment.provider_state','delivery_order',selected_intent.order_id,jsonb_build_object('payment_intent_id',selected_intent.id,'provider_status',$2,'event_type',$3->>'event'));
end;
$$;

create or replace function public.record_payment_refund_event(payment_intent_id uuid, provider_refund_id text, refund_event_type text, refund_amount_minor integer, refund_currency text, event_payload jsonb) returns void
language plpgsql security definer set search_path=public as $$
declare selected_intent public.payment_intents%rowtype;
declare refund_status text;
declare processed_total integer;
declare next_status public.payment_status;
begin
  select * into selected_intent from public.payment_intents where id=$1 for update;
  if not found then raise exception 'payment intent not found'; end if;
  if $4 is null or $4<=0 or $4>selected_intent.amount_minor then raise exception 'refund amount mismatch'; end if;
  if $5 is distinct from selected_intent.currency then raise exception 'refund currency mismatch'; end if;
  refund_status := case $3 when 'refund.pending' then 'pending' when 'refund.processing' then 'processing' when 'refund.needs-attention' then 'needs_attention' when 'refund.failed' then 'failed' when 'refund.processed' then 'processed' else null end;
  if refund_status is null then raise exception 'unsupported refund event'; end if;
  insert into public.payment_refunds(payment_intent_id,provider_refund_id,amount_minor,currency,status,immutable_payload)
  values(selected_intent.id,$2,$4,$5,refund_status,$6)
  on conflict on constraint payment_refunds_payment_intent_id_provider_refund_id_key do update set status=excluded.status,immutable_payload=excluded.immutable_payload,updated_at=now();
  select coalesce(sum(r.amount_minor),0) into processed_total from public.payment_refunds r where r.payment_intent_id=selected_intent.id and r.status='processed';
  if processed_total>selected_intent.amount_minor then raise exception 'processed refunds exceed payment amount'; end if;
  next_status := case when processed_total>=selected_intent.amount_minor then 'refunded'::public.payment_status when processed_total>0 then 'partially_refunded'::public.payment_status else 'paid'::public.payment_status end;
  update public.payment_intents set status=next_status,refunded_amount_minor=processed_total,last_provider_status=$3,updated_at=now() where id=selected_intent.id;
  if selected_intent.surcharge_id is null then
    update public.delivery_orders set payment_status=next_status,updated_at=now() where id=selected_intent.order_id;
  else
    update public.customer_surcharges set status=case when refund_status in ('pending','processing','needs_attention') then 'refund_pending' when processed_total>=selected_intent.amount_minor then 'refunded' when processed_total>0 then 'partially_refunded' else 'paid' end,refunded_amount_kobo=processed_total,updated_at=now() where id=selected_intent.surcharge_id;
  end if;
end;
$$;

create or replace function public.record_payment_dispute_event(payment_intent_id uuid, provider_dispute_id text, dispute_event_type text, dispute_amount_minor integer, dispute_currency text, event_payload jsonb) returns void
language plpgsql security definer set search_path=public as $$
declare selected_intent public.payment_intents%rowtype;
declare dispute_state text;
declare aggregate_dispute_state text;
begin
  select * into selected_intent from public.payment_intents where id=$1 for update;
  if not found then raise exception 'payment intent not found'; end if;
  if $4 is not null and ($4<=0 or $4>selected_intent.amount_minor) then raise exception 'dispute amount mismatch'; end if;
  if $5 is not null and $5 is distinct from selected_intent.currency then raise exception 'dispute currency mismatch'; end if;
  dispute_state := case $3 when 'charge.dispute.create' then 'open' when 'charge.dispute.remind' then 'reminded' when 'charge.dispute.resolve' then 'resolved' else null end;
  if dispute_state is null then raise exception 'unsupported dispute event'; end if;
  insert into public.payment_disputes(payment_intent_id,provider_dispute_id,amount_minor,currency,status,immutable_payload)
  values(selected_intent.id,$2,$4,$5,dispute_state,$6)
  on conflict on constraint payment_disputes_payment_intent_id_provider_dispute_id_key do update set status=excluded.status,immutable_payload=excluded.immutable_payload,updated_at=now();
  aggregate_dispute_state := case
    when exists(select 1 from public.payment_disputes d where d.payment_intent_id=selected_intent.id and d.status='open') then 'open'
    when exists(select 1 from public.payment_disputes d where d.payment_intent_id=selected_intent.id and d.status='reminded') then 'reminded'
    else 'resolved'
  end;
  update public.payment_intents set dispute_status=aggregate_dispute_state,disputed_at=case when aggregate_dispute_state='resolved' then disputed_at else coalesce(disputed_at,now()) end,last_provider_status=$3,updated_at=now() where id=selected_intent.id;
end;
$$;

create or replace function public.order_has_verified_payment_clearance(target_order_id uuid) returns boolean
language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.delivery_orders o where o.id=$1 and o.payment_status='paid')
    and exists(
      select 1 from public.payment_intents i
      where i.order_id=$1 and i.surcharge_id is null and i.status='paid'
        and exists(
          select 1 from public.payment_transactions t
          where t.payment_intent_id=i.id and t.order_id=$1 and t.status='paid'
            and t.amount_minor=i.amount_minor and t.currency=i.currency
        )
    )
    and not exists(select 1 from public.payment_intents i where i.order_id=$1 and (i.dispute_status in ('open','reminded') or i.last_provider_status in ('refund.pending','refund.processing','refund.needs-attention')))
    and not exists(select 1 from public.payment_disputes d join public.payment_intents i on i.id=d.payment_intent_id where i.order_id=$1 and d.status in ('open','reminded'))
    and not exists(select 1 from public.customer_surcharges s where s.order_id=$1 and s.mandatory_for_handover and s.status in ('customer_approved','payment_pending','disputed','refund_pending','partially_refunded','refunded'))
    and not exists(
      select 1 from public.customer_surcharges s
      where s.order_id=$1 and s.mandatory_for_handover and s.status='paid'
        and not exists(
          select 1 from public.payment_intents i
          where i.surcharge_id=s.id and i.status='paid' and coalesce(i.dispute_status,'resolved')='resolved'
            and exists(
              select 1 from public.payment_transactions t
              where t.payment_intent_id=i.id and t.order_id=$1 and t.status='paid'
                and t.amount_minor=i.amount_minor and t.currency=i.currency
            )
        )
    );
$$;

create or replace function public.transition_delivery_order(order_id uuid,new_status public.delivery_status,metadata jsonb default '{}'::jsonb) returns void
language plpgsql security definer set search_path=public as $$
declare selected_order public.delivery_orders%rowtype;
declare allowed boolean := false;
declare event_actor_id uuid := coalesce(nullif(metadata->>'actorUserId','')::uuid,auth.uid());
declare event_actor_type text := coalesce(nullif(metadata->>'actorRole',''),case when auth.uid() is null then 'system' else 'admin' end);
begin
  select * into selected_order from public.delivery_orders where id=$1 for update;
  if not found then raise exception 'order not found'; end if;
  allowed := case selected_order.delivery_status
    when 'draft' then $2 in ('awaiting_confirmation','cancelled')
    when 'awaiting_confirmation' then $2 in ('confirmed','cancelled')
    when 'confirmed' then $2 in ('awaiting_assignment','cancelled')
    when 'awaiting_assignment' then $2 in ('assigned','cancelled')
    when 'assigned' then $2 in ('rider_en_route_to_pickup','cancelled')
    when 'rider_en_route_to_pickup' then $2 in ('picked_up','delivery_failed','cancelled')
    when 'picked_up' then $2 in ('in_transit','delivery_failed')
    when 'in_transit' then $2 in ('arrived_at_destination','delivery_failed')
    when 'arrived_at_destination' then $2 in ('awaiting_payment','delivered','delivery_failed')
    when 'awaiting_payment' then $2 in ('delivered','delivery_failed')
    when 'delivery_failed' then $2 in ('awaiting_assignment','cancelled') else false end;
  if not allowed then raise exception 'invalid status transition'; end if;
  if $2='delivered' and not public.order_has_verified_payment_clearance($1) then raise exception 'payment clearance required'; end if;
  update public.delivery_orders set delivery_status=$2,updated_at=now() where id=$1;
  insert into public.delivery_status_events(order_id,previous_status,new_status,actor_id,actor_type,metadata) values($1,selected_order.delivery_status,$2,event_actor_id,event_actor_type,$3);
end;
$$;

revoke all on function public.record_verified_payment(uuid,text,jsonb) from public,anon,authenticated;
revoke all on function public.record_payment_provider_state(uuid,text,jsonb) from public,anon,authenticated;
revoke all on function public.record_payment_refund_event(uuid,text,text,integer,text,jsonb) from public,anon,authenticated;
revoke all on function public.record_payment_dispute_event(uuid,text,text,integer,text,jsonb) from public,anon,authenticated;
revoke all on function public.order_has_verified_payment_clearance(uuid) from public,anon,authenticated;
revoke all on function public.transition_delivery_order(uuid,public.delivery_status,jsonb) from public,anon,authenticated;
grant execute on function public.record_verified_payment(uuid,text,jsonb) to service_role;
grant execute on function public.record_payment_provider_state(uuid,text,jsonb) to service_role;
grant execute on function public.record_payment_refund_event(uuid,text,text,integer,text,jsonb) to service_role;
grant execute on function public.record_payment_dispute_event(uuid,text,text,integer,text,jsonb) to service_role;
grant execute on function public.order_has_verified_payment_clearance(uuid) to service_role;
grant execute on function public.transition_delivery_order(uuid,public.delivery_status,jsonb) to service_role;
