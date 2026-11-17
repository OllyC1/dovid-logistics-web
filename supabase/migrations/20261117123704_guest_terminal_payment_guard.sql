-- Prevent any customer or guest payment workflow from opening a new payment
-- after a delivery reaches a terminal state. These database triggers are a
-- final safety boundary beneath the API checks.

create or replace function public.guard_terminal_order_payment_mutation()
returns trigger
language plpgsql set search_path=public as $$
declare
  order_status public.delivery_status;
begin
  select delivery_status into order_status
  from public.delivery_orders
  where id=new.order_id;
  if not found then raise exception 'delivery order not found'; end if;
  if order_status in ('cancelled','delivered') then
    raise exception 'terminal delivery cannot accept new payment activity';
  end if;
  return new;
end;
$$;

revoke all on function public.guard_terminal_order_payment_mutation()
  from public,anon,authenticated;

create trigger payment_intents_terminal_order_guard
before insert on public.payment_intents
for each row execute function public.guard_terminal_order_payment_mutation();

create trigger receiver_payment_tokens_terminal_order_guard
before insert on public.receiver_payment_tokens
for each row execute function public.guard_terminal_order_payment_mutation();

create or replace function public.guard_terminal_order_surcharge_approval()
returns trigger
language plpgsql set search_path=public as $$
declare
  order_status public.delivery_status;
begin
  if new.status not in ('customer_approved','payment_pending')
    or new.status is not distinct from old.status then return new; end if;
  select delivery_status into order_status
  from public.delivery_orders
  where id=new.order_id;
  if not found then raise exception 'delivery order not found'; end if;
  if order_status in ('cancelled','delivered') then
    raise exception 'terminal delivery cannot approve a new charge';
  end if;
  return new;
end;
$$;

revoke all on function public.guard_terminal_order_surcharge_approval()
  from public,anon,authenticated;

create trigger customer_surcharges_terminal_order_guard
before update of status on public.customer_surcharges
for each row execute function public.guard_terminal_order_surcharge_approval();
