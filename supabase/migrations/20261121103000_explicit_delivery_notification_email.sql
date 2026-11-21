-- Store the email explicitly provided for delivery communications.

alter table public.delivery_orders
  add column if not exists notification_email text;

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
begin
  select * into selected_order from public.delivery_orders where id = target_order_id;
  if not found then return; end if;
  customer_email := lower(coalesce(selected_order.notification_email, selected_order.receipt_email));
  if customer_email is null and selected_order.customer_id is not null then
    select lower(email) into customer_email from auth.users
    where id = selected_order.customer_id and deleted_at is null;
  end if;
  if customer_email is null then return; end if;
  action_path := case when selected_order.customer_id is null
    then '/track/' || selected_order.tracking_reference
    else coalesce(notification_metadata->>'actionPath', '/account/orders/' || selected_order.id::text)
  end;
  insert into public.notifications(
    customer_id, order_id, channel, event_type, title, subject, body, recipient_email,
    deduplication_key, status, delivery_status, priority, metadata, next_attempt_at
  )
  values(
    selected_order.customer_id, selected_order.id, 'email', notification_event,
    notification_title, notification_title,
    notification_body || ' Track it here: ' || action_path,
    customer_email, notification_key, 'queued', 'queued', notification_priority,
    notification_metadata || jsonb_build_object(
      'orderReference', selected_order.order_reference,
      'trackingReference', selected_order.tracking_reference,
      'pickupAddress', selected_order.pickup_address,
      'deliveryAddress', selected_order.delivery_address,
      'paymentStatus', selected_order.payment_status,
      'amountMinor', selected_order.quoted_amount_minor,
      'currency', selected_order.currency
    ), now()
  )
  on conflict(deduplication_key) do nothing;
end;
$$;
