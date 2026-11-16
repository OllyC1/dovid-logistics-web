-- Durable transactional email queue and Resend delivery audit.

-- RLS policies call tightly-scoped private helper functions. Authenticated users
-- need schema usage to execute only the functions explicitly granted to them.
grant usage on schema private to authenticated;

alter table public.notifications
  add column if not exists recipient_email text,
  add column if not exists subject text,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists priority smallint not null default 50 check (priority between 0 and 100),
  add column if not exists provider text,
  add column if not exists provider_message_id text,
  add column if not exists delivery_status text not null default 'queued'
    check (delivery_status in ('queued','accepted','delivered','deferred','bounced','complained','failed','skipped')),
  add column if not exists claim_token uuid,
  add column if not exists claimed_at timestamptz,
  add column if not exists lease_expires_at timestamptz,
  add column if not exists last_error_code text,
  add column if not exists last_error_message text,
  add column if not exists accepted_at timestamptz,
  add column if not exists delivered_at timestamptz,
  add column if not exists failed_at timestamptz;

create unique index if not exists notifications_provider_message_idx
  on public.notifications(provider,provider_message_id)
  where provider_message_id is not null;
create index if not exists notifications_email_queue_idx
  on public.notifications(priority desc,next_attempt_at,created_at)
  where channel='email' and status in ('queued','failed');

create table if not exists public.notification_delivery_attempts (
  id bigint generated always as identity primary key,
  notification_id uuid not null references public.notifications(id) on delete restrict,
  attempt_number integer not null check (attempt_number > 0),
  provider text not null,
  outcome text not null check (outcome in ('accepted','retry_scheduled','permanent_failure','configuration_error')),
  provider_message_id text,
  error_code text,
  error_message text,
  retry_at timestamptz,
  created_at timestamptz not null default now(),
  unique(notification_id,attempt_number)
);
create index if not exists notification_delivery_attempts_notification_idx
  on public.notification_delivery_attempts(notification_id,created_at desc);

create table if not exists public.email_provider_events (
  id bigint generated always as identity primary key,
  provider text not null,
  provider_event_id text not null,
  provider_message_id text,
  event_type text not null,
  payload jsonb not null,
  received_at timestamptz not null default now(),
  unique(provider,provider_event_id)
);
create index if not exists email_provider_events_message_idx
  on public.email_provider_events(provider,provider_message_id,received_at desc);

alter table public.notification_delivery_attempts enable row level security;
alter table public.email_provider_events enable row level security;
revoke all on public.notification_delivery_attempts,public.email_provider_events from public,anon,authenticated;
grant select,insert on public.notification_delivery_attempts,public.email_provider_events to service_role;
grant update on public.notifications to service_role;
grant usage,select on sequence public.notification_delivery_attempts_id_seq to service_role;
grant usage,select on sequence public.email_provider_events_id_seq to service_role;

create or replace function private.reject_email_audit_mutation() returns trigger
language plpgsql set search_path=public,private as $$
begin
  raise exception 'email delivery audit history is immutable';
end;
$$;
drop trigger if exists notification_delivery_attempts_immutable on public.notification_delivery_attempts;
create trigger notification_delivery_attempts_immutable before update or delete on public.notification_delivery_attempts
for each row execute function private.reject_email_audit_mutation();
drop trigger if exists email_provider_events_immutable on public.email_provider_events;
create trigger email_provider_events_immutable before update or delete on public.email_provider_events
for each row execute function private.reject_email_audit_mutation();

create or replace function public.claim_email_notifications(worker_token uuid, batch_limit integer default 10)
returns setof public.notifications
language plpgsql security definer set search_path=public,auth as $$
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then raise exception 'service role required'; end if;
  if worker_token is null then raise exception 'worker token required'; end if;
  return query
  with candidates as (
    select id from public.notifications
    where channel='email'
      and recipient_email is not null
      and subject is not null
      and attempt_count < 8
      and (status='queued' or (status='failed' and coalesce(next_attempt_at,now())<=now()) or (status='sending' and lease_expires_at<now()))
    order by priority desc,coalesce(next_attempt_at,created_at),created_at
    for update skip locked
    limit greatest(1,least(batch_limit,25))
  )
  update public.notifications n
  set status='sending',claim_token=worker_token,claimed_at=now(),lease_expires_at=now()+interval '5 minutes',attempt_count=attempt_count+1
  from candidates c where n.id=c.id
  returning n.*;
end;
$$;

revoke all on function public.claim_email_notifications(uuid,integer) from public,anon,authenticated;
grant execute on function public.claim_email_notifications(uuid,integer) to service_role;

create or replace function private.queue_order_email(
  target_order_id uuid,
  notification_event text,
  notification_title text,
  notification_body text,
  notification_key text,
  notification_priority integer default 50,
  notification_metadata jsonb default '{}'::jsonb
) returns void
language plpgsql security definer set search_path=public,auth,private as $$
declare selected_order public.delivery_orders%rowtype;
declare customer_email text;
begin
  select * into selected_order from public.delivery_orders where id=target_order_id;
  if not found then return; end if;
  select lower(email) into customer_email from auth.users where id=selected_order.customer_id and deleted_at is null;
  if customer_email is null then return; end if;
  insert into public.notifications(customer_id,order_id,channel,event_type,title,subject,body,recipient_email,deduplication_key,status,delivery_status,priority,metadata,next_attempt_at)
  values(selected_order.customer_id,selected_order.id,'email',notification_event,notification_title,notification_title,notification_body,customer_email,notification_key,'queued','queued',notification_priority,
    notification_metadata || jsonb_build_object('orderReference',selected_order.order_reference,'trackingReference',selected_order.tracking_reference,'pickupAddress',selected_order.pickup_address,'deliveryAddress',selected_order.delivery_address,'paymentStatus',selected_order.payment_status,'amountMinor',selected_order.quoted_amount_minor,'currency',selected_order.currency),now())
  on conflict(deduplication_key) do nothing;
end;
$$;
revoke all on function private.queue_order_email(uuid,text,text,text,text,integer,jsonb) from public,anon,authenticated;

create or replace function private.queue_delivery_status_email() returns trigger
language plpgsql security definer set search_path=public,private as $$
begin
  if new.new_status='confirmed' then
    perform private.queue_order_email(new.order_id,'booking_confirmed','Your Dovid delivery is confirmed','We have confirmed your delivery request. You can follow progress from your secure tracking page.','email:booking-confirmed:'||new.order_id,80,jsonb_build_object('actionPath','/account/orders/'||new.order_id));
  elsif new.new_status='picked_up' then
    perform private.queue_order_email(new.order_id,'package_collected','Your package has been collected','Your rider has collected the package and the delivery is now in progress.','email:package-collected:'||new.order_id,55,jsonb_build_object('actionPath','/track'));
  elsif new.new_status='delivered' then
    perform private.queue_order_email(new.order_id,'package_delivered','Your delivery is complete','The delivery has been completed. Your receipt and authorized proof remain available in your account.','email:package-delivered:'||new.order_id,70,jsonb_build_object('actionPath','/account/orders/'||new.order_id));
  elsif new.new_status='delivery_failed' then
    perform private.queue_order_email(new.order_id,'delivery_failed','We could not complete this delivery','Dispatch is reviewing the delivery attempt. Open your order for the next approved step.','email:delivery-failed:'||new.id,75,jsonb_build_object('actionPath','/account/orders/'||new.order_id));
  end if;
  return new;
end;
$$;
drop trigger if exists queue_delivery_status_email on public.delivery_status_events;
create trigger queue_delivery_status_email after insert on public.delivery_status_events
for each row execute function private.queue_delivery_status_email();

create or replace function private.queue_payment_confirmation_email() returns trigger
language plpgsql security definer set search_path=public,private as $$
begin
  if new.status='paid' and old.status is distinct from new.status then
    perform private.queue_order_email(new.order_id,'payment_confirmed','Payment confirmed','Your payment has been verified and recorded securely.','email:payment-confirmed:'||new.id,90,jsonb_build_object('actionPath','/account/orders/'||new.order_id,'paymentIntentId',new.id,'amountMinor',new.amount_minor,'currency',new.currency));
  end if;
  return new;
end;
$$;
drop trigger if exists queue_payment_confirmation_email on public.payment_intents;
create trigger queue_payment_confirmation_email after update of status on public.payment_intents
for each row execute function private.queue_payment_confirmation_email();

create or replace function private.queue_surcharge_email() returns trigger
language plpgsql security definer set search_path=public,private as $$
begin
  if new.status='customer_approved' and old.status is distinct from new.status then
    perform private.queue_order_email(new.order_id,'additional_fee_request','An approved delivery charge is ready','An additional delivery charge has been approved. Review the reason and pay securely from your order page.','email:surcharge-approved:'||new.id,85,jsonb_build_object('actionPath','/account/orders/'||new.order_id,'surchargeId',new.id,'amountMinor',new.approved_amount_kobo,'currency','NGN','reason',new.description));
  end if;
  return new;
end;
$$;
drop trigger if exists queue_surcharge_email on public.customer_surcharges;
create trigger queue_surcharge_email after update of status on public.customer_surcharges
for each row execute function private.queue_surcharge_email();

create or replace function private.queue_redelivery_email() returns trigger
language plpgsql security definer set search_path=public,private as $$
begin
  if new.status='scheduled' and old.status is distinct from new.status then
    perform private.queue_order_email(new.order_id,'redelivery_scheduled','Your redelivery is scheduled','Dispatch has scheduled the approved redelivery. Open your order to review the latest details.','email:redelivery-scheduled:'||new.id,70,jsonb_build_object('actionPath','/account/orders/'||new.order_id,'redeliveryRequestId',new.id,'scheduledAt',new.scheduled_at));
  end if;
  return new;
end;
$$;
drop trigger if exists queue_redelivery_email on public.redelivery_requests;
create trigger queue_redelivery_email after update of status on public.redelivery_requests
for each row execute function private.queue_redelivery_email();

revoke all on function private.reject_email_audit_mutation() from public,anon,authenticated;
revoke all on function private.queue_delivery_status_email() from public,anon,authenticated;
revoke all on function private.queue_payment_confirmation_email() from public,anon,authenticated;
revoke all on function private.queue_surcharge_email() from public,anon,authenticated;
revoke all on function private.queue_redelivery_email() from public,anon,authenticated;
