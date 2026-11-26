-- Keep the payer's receipt address on the immutable payment intent context.
-- Delivery progress still goes to the order's notification contact.

alter table public.payment_intents
  add column if not exists receipt_email text;

alter table public.payment_intents
  drop constraint if exists payment_intents_receipt_email_format_check;

alter table public.payment_intents
  add constraint payment_intents_receipt_email_format_check
  check (
    receipt_email is null
    or (
      receipt_email = lower(btrim(receipt_email))
      and receipt_email !~ '[[:space:]]'
      and receipt_email ~ '^[^@]+@[^@]+[.][^@]+$'
      and length(receipt_email) <= 320
    )
  );

create or replace function private.queue_order_email(
  target_order_id uuid,
  notification_event text,
  notification_title text,
  notification_body text,
  notification_key text,
  notification_priority integer default 50,
  notification_metadata jsonb default '{}'::jsonb
) returns void
language plpgsql
security definer
set search_path = public, auth, private
as $$
declare selected_order public.delivery_orders%rowtype;
declare customer_email text;
declare action_path text;
declare safe_metadata jsonb;
begin
  select * into selected_order from public.delivery_orders where id = target_order_id;
  if not found then return; end if;

  customer_email := lower(coalesce(
    nullif(btrim(notification_metadata->>'recipientEmail'), ''),
    selected_order.notification_email,
    selected_order.receipt_email
  ));
  if customer_email is null and selected_order.customer_id is not null then
    select lower(email) into customer_email
    from auth.users
    where id = selected_order.customer_id and deleted_at is null;
  end if;
  if customer_email is null then return; end if;

  action_path := case
    when selected_order.customer_id is null then '/track/' || selected_order.tracking_reference
    else coalesce(notification_metadata->>'actionPath', '/account/orders/' || selected_order.id::text)
  end;
  safe_metadata := notification_metadata - 'recipientEmail';

  insert into public.notifications(
    customer_id, order_id, channel, event_type, title, subject, body, recipient_email,
    deduplication_key, status, delivery_status, priority, metadata, next_attempt_at
  ) values (
    selected_order.customer_id, selected_order.id, 'email', notification_event,
    notification_title, notification_title, notification_body,
    customer_email, notification_key, 'queued', 'queued', notification_priority,
    jsonb_build_object(
      'orderReference', selected_order.order_reference,
      'trackingReference', selected_order.tracking_reference,
      'pickupAddress', selected_order.pickup_address,
      'deliveryAddress', selected_order.delivery_address,
      'paymentStatus', selected_order.payment_status,
      'amountMinor', selected_order.quoted_amount_minor,
      'currency', selected_order.currency
    ) || safe_metadata || jsonb_build_object('actionPath', action_path),
    now()
  )
  on conflict(deduplication_key) do nothing;
end;
$$;

create or replace function private.queue_payment_confirmation_email() returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if new.status = 'paid' and old.status is distinct from new.status then
    perform private.queue_order_email(
      new.order_id,
      'payment_confirmed',
      'Payment confirmed',
      'Your payment has been verified and recorded securely.',
      'email:payment-confirmed:' || new.id,
      90,
      jsonb_build_object(
        'actionPath', '/account/orders/' || new.order_id,
        'paymentIntentId', new.id,
        'amountMinor', new.amount_minor,
        'currency', new.currency,
        'recipientEmail', new.receipt_email
      )
    );
  end if;
  return new;
end;
$$;

revoke all on function private.queue_order_email(uuid,text,text,text,text,integer,jsonb) from public, anon, authenticated;
revoke all on function private.queue_payment_confirmation_email() from public, anon, authenticated;

comment on column public.payment_intents.receipt_email is
  'Server-recorded payer address used only for this payment intent receipt; never used for order progress notifications.';
