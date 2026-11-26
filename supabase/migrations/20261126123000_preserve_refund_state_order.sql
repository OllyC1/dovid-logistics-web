-- Refund webhooks may be retried or delivered out of order. Preserve every raw
-- provider event, but never let an older lifecycle state move the reconciled
-- refund or payment intent backwards.

create or replace function public.record_payment_refund_event(
  payment_intent_id uuid,
  provider_refund_id text,
  refund_event_type text,
  refund_amount_minor integer,
  refund_currency text,
  event_payload jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare selected_intent public.payment_intents%rowtype;
declare refund_status text;
declare processed_total integer;
declare next_status public.payment_status;
declare effective_provider_status text;
begin
  select * into selected_intent
  from public.payment_intents
  where id = $1
  for update;

  if not found then raise exception 'payment intent not found'; end if;
  if $4 is null or $4 <= 0 or $4 > selected_intent.amount_minor then
    raise exception 'refund amount mismatch';
  end if;
  if $5 is distinct from selected_intent.currency then
    raise exception 'refund currency mismatch';
  end if;

  refund_status := case $3
    when 'refund.pending' then 'pending'
    when 'refund.processing' then 'processing'
    when 'refund.needs-attention' then 'needs_attention'
    when 'refund.failed' then 'failed'
    when 'refund.processed' then 'processed'
    else null
  end;
  if refund_status is null then raise exception 'unsupported refund event'; end if;

  insert into public.payment_refunds(
    payment_intent_id, provider_refund_id, amount_minor, currency, status, immutable_payload
  ) values (
    selected_intent.id, $2, $4, $5, refund_status, $6
  )
  on conflict on constraint payment_refunds_payment_intent_id_provider_refund_id_key
  do update set
    status = excluded.status,
    immutable_payload = excluded.immutable_payload,
    updated_at = now()
  where
    case excluded.status
      when 'pending' then 1
      when 'processing' then 2
      when 'needs_attention' then 2
      when 'failed' then 3
      when 'processed' then 4
    end
    >=
    case public.payment_refunds.status
      when 'pending' then 1
      when 'processing' then 2
      when 'needs_attention' then 2
      when 'failed' then 3
      when 'processed' then 4
    end;

  select r.status into refund_status
  from public.payment_refunds r
  where r.payment_intent_id = selected_intent.id
    and r.provider_refund_id = $2;

  select coalesce(sum(r.amount_minor), 0) into processed_total
  from public.payment_refunds r
  where r.payment_intent_id = selected_intent.id
    and r.status = 'processed';

  if processed_total > selected_intent.amount_minor then
    raise exception 'processed refunds exceed payment amount';
  end if;

  next_status := case
    when processed_total >= selected_intent.amount_minor then 'refunded'::public.payment_status
    when processed_total > 0 then 'partially_refunded'::public.payment_status
    else 'paid'::public.payment_status
  end;
  effective_provider_status := case refund_status
    when 'needs_attention' then 'refund.needs-attention'
    else 'refund.' || refund_status
  end;

  update public.payment_intents
  set status = next_status,
      refunded_amount_minor = processed_total,
      last_provider_status = effective_provider_status,
      updated_at = now()
  where id = selected_intent.id;

  if selected_intent.surcharge_id is null then
    update public.delivery_orders
    set payment_status = next_status,
        updated_at = now()
    where id = selected_intent.order_id;
  else
    update public.customer_surcharges
    set status = case
          when refund_status in ('pending', 'processing', 'needs_attention') then 'refund_pending'
          when processed_total >= selected_intent.amount_minor then 'refunded'
          when processed_total > 0 then 'partially_refunded'
          else 'paid'
        end,
        refunded_amount_kobo = processed_total,
        updated_at = now()
    where id = selected_intent.surcharge_id;
  end if;
end;
$$;

revoke all on function public.record_payment_refund_event(uuid,text,text,integer,text,jsonb)
from public, anon, authenticated;
grant execute on function public.record_payment_refund_event(uuid,text,text,integer,text,jsonb)
to service_role;
