create extension if not exists pgcrypto;

create type public.delivery_status as enum ('draft','awaiting_confirmation','confirmed','awaiting_assignment','assigned','rider_en_route_to_pickup','picked_up','in_transit','arrived_at_destination','awaiting_payment','delivered','delivery_failed','cancelled');
create type public.payment_status as enum ('unpaid','pending','processing','paid','failed','expired','refunded','partially_refunded');
create type public.payer_type as enum ('sender','receiver_before_delivery','receiver_at_delivery');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  phone text,
  default_currency text not null default 'NGN',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.customer_addresses (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles(id) on delete cascade,
  label text not null,
  address_line text not null,
  latitude numeric(10,7) not null,
  longitude numeric(10,7) not null,
  instructions text,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.service_areas (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  city text not null,
  state text not null,
  country_code char(2) not null default 'NG',
  currency char(3) not null default 'NGN',
  active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.service_zones (
  id uuid primary key default gen_random_uuid(),
  service_area_id uuid not null references public.service_areas(id) on delete cascade,
  name text not null,
  boundary_geojson jsonb not null,
  active boolean not null default false,
  created_at timestamptz not null default now(),
  check (jsonb_typeof(boundary_geojson) = 'object')
);

create table public.pricing_rules (
  id uuid primary key default gen_random_uuid(),
  service_area_id uuid references public.service_areas(id) on delete cascade,
  name text not null,
  base_fee_minor integer not null check (base_fee_minor >= 0),
  included_distance_meters integer not null default 0 check (included_distance_meters >= 0),
  per_kilometer_minor integer not null check (per_kilometer_minor >= 0),
  minimum_fee_minor integer not null check (minimum_fee_minor >= 0),
  size_surcharges jsonb not null default '{}'::jsonb,
  currency char(3) not null default 'NGN',
  priority integer not null default 0,
  active boolean not null default false,
  effective_from timestamptz not null default now(),
  effective_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (effective_until is null or effective_until > effective_from)
);

create table public.quotes (
  id uuid primary key default gen_random_uuid(),
  pricing_rule_id uuid not null references public.pricing_rules(id),
  customer_id uuid references public.profiles(id) on delete set null,
  request_payload jsonb not null,
  distance_meters integer not null check (distance_meters >= 0),
  amount_minor integer not null check (amount_minor >= 0),
  currency char(3) not null default 'NGN',
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table public.delivery_orders (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles(id),
  business_account_id uuid,
  rider_id uuid,
  quote_id uuid not null references public.quotes(id),
  order_reference text not null unique,
  tracking_reference text not null unique,
  idempotency_key uuid not null,
  pickup_address text not null,
  pickup_latitude numeric(10,7) not null,
  pickup_longitude numeric(10,7) not null,
  pickup_instructions text,
  delivery_address text not null,
  delivery_latitude numeric(10,7) not null,
  delivery_longitude numeric(10,7) not null,
  delivery_instructions text,
  sender_name text not null,
  sender_phone text not null,
  recipient_name text not null,
  recipient_phone text not null,
  payer public.payer_type not null,
  payment_method text not null check (payment_method in ('online','bank_transfer')),
  delivery_status public.delivery_status not null default 'awaiting_confirmation',
  payment_status public.payment_status not null default 'unpaid',
  distance_meters integer not null check (distance_meters >= 0),
  quoted_amount_minor integer not null check (quoted_amount_minor >= 0),
  currency char(3) not null default 'NGN',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (customer_id, idempotency_key)
);

create table public.delivery_packages (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.delivery_orders(id) on delete cascade,
  category text not null,
  size text not null check (size in ('small','medium','large')),
  description text not null,
  handling_instructions text,
  declared_value_minor integer check (declared_value_minor is null or declared_value_minor >= 0),
  created_at timestamptz not null default now()
);

create table public.delivery_status_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.delivery_orders(id) on delete cascade,
  previous_status public.delivery_status,
  new_status public.delivery_status not null,
  actor_id uuid references auth.users(id) on delete set null,
  actor_type text not null check (actor_type in ('customer','rider','admin','system')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.payment_intents (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.delivery_orders(id) on delete cascade,
  provider text not null,
  provider_reference text not null unique,
  amount_minor integer not null check (amount_minor > 0),
  currency char(3) not null default 'NGN',
  status public.payment_status not null default 'pending',
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.payment_transactions (
  id uuid primary key default gen_random_uuid(),
  payment_intent_id uuid not null references public.payment_intents(id),
  order_id uuid not null references public.delivery_orders(id),
  provider_transaction_id text not null,
  amount_minor integer not null,
  currency char(3) not null,
  status public.payment_status not null,
  immutable_payload jsonb not null,
  created_at timestamptz not null default now(),
  unique (payment_intent_id, provider_transaction_id)
);

create table public.payment_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  provider_event_id text not null,
  event_type text not null,
  payload jsonb not null,
  received_at timestamptz not null default now(),
  unique (provider, provider_event_id)
);

create table public.verified_payment_accounts (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  bank_name text not null,
  account_name text not null,
  account_number_ciphertext text not null,
  active boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.receiver_payment_tokens (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.delivery_orders(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.delivery_proofs (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.delivery_orders(id) on delete cascade,
  completed_at timestamptz not null,
  recipient_name text,
  notes text,
  storage_path text,
  payment_clearance_verified boolean not null,
  confirmed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles(id) on delete cascade,
  order_id uuid references public.delivery_orders(id) on delete cascade,
  channel text not null check (channel in ('in_app','email','sms','whatsapp')),
  event_type text not null,
  title text not null,
  body text not null,
  deduplication_key text not null unique,
  status text not null default 'queued' check (status in ('queued','sending','sent','failed','skipped')),
  attempt_count integer not null default 0,
  next_attempt_at timestamptz,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.support_requests (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.profiles(id) on delete set null,
  order_id uuid references public.delivery_orders(id) on delete set null,
  name text not null,
  email text not null,
  phone text,
  company_name text,
  subject text not null,
  message text not null,
  source text not null default 'website',
  status text not null default 'open',
  created_at timestamptz not null default now()
);

create table public.business_enquiries (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  phone text,
  company_name text,
  subject text not null,
  message text not null,
  source text not null default 'website',
  status text not null default 'new',
  created_at timestamptz not null default now()
);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users(id) on delete set null,
  actor_type text not null,
  action text not null,
  resource_type text not null,
  resource_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index delivery_orders_customer_created_idx on public.delivery_orders(customer_id, created_at desc);
create index delivery_orders_tracking_idx on public.delivery_orders(tracking_reference);
create index delivery_orders_status_idx on public.delivery_orders(delivery_status, created_at);
create index delivery_status_events_order_created_idx on public.delivery_status_events(order_id, created_at);
create index payment_intents_order_idx on public.payment_intents(order_id, created_at desc);
create index notifications_customer_created_idx on public.notifications(customer_id, created_at desc);

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles(id, full_name, phone) values(new.id, new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'phone') on conflict (id) do nothing;
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create or replace function public.create_delivery_order(booking_payload jsonb) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  current_user_id uuid := auth.uid();
  selected_quote public.quotes%rowtype;
  created_order public.delivery_orders%rowtype;
  order_ref text;
  tracking_ref text;
  receiver_token text;
begin
  if current_user_id is null then raise exception 'authentication required'; end if;
  select * into selected_quote from public.quotes where id = (booking_payload->>'quoteId')::uuid and expires_at > now() for update;
  if not found then raise exception 'quote is missing or expired'; end if;
  if selected_quote.request_payload->>'pickupAddress' is distinct from booking_payload->>'pickupAddress' or selected_quote.request_payload->>'deliveryAddress' is distinct from booking_payload->>'deliveryAddress' or selected_quote.request_payload->>'packageSize' is distinct from booking_payload->>'packageSize' then raise exception 'booking does not match quote'; end if;
  order_ref := 'DOV-' || to_char(now(), 'YYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  tracking_ref := 'TRK-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 14));
  insert into public.delivery_orders(customer_id,quote_id,order_reference,tracking_reference,idempotency_key,pickup_address,pickup_latitude,pickup_longitude,pickup_instructions,delivery_address,delivery_latitude,delivery_longitude,delivery_instructions,sender_name,sender_phone,recipient_name,recipient_phone,payer,payment_method,distance_meters,quoted_amount_minor,currency)
  values(current_user_id,selected_quote.id,order_ref,tracking_ref,(booking_payload->>'idempotencyKey')::uuid,booking_payload->>'pickupAddress',(booking_payload#>>'{pickupCoordinates,latitude}')::numeric,(booking_payload#>>'{pickupCoordinates,longitude}')::numeric,booking_payload->>'pickupInstructions',booking_payload->>'deliveryAddress',(booking_payload#>>'{deliveryCoordinates,latitude}')::numeric,(booking_payload#>>'{deliveryCoordinates,longitude}')::numeric,booking_payload->>'deliveryInstructions',booking_payload->>'senderName',booking_payload->>'senderPhone',booking_payload->>'recipientName',booking_payload->>'recipientPhone',(booking_payload->>'payer')::public.payer_type,booking_payload->>'paymentMethod',selected_quote.distance_meters,selected_quote.amount_minor,selected_quote.currency)
  on conflict(customer_id,idempotency_key) do update set updated_at = public.delivery_orders.updated_at returning * into created_order;
  insert into public.delivery_packages(order_id,category,size,description,handling_instructions,declared_value_minor) values(created_order.id,booking_payload->>'packageCategory',booking_payload->>'packageSize',booking_payload->>'packageDescription',booking_payload->>'handlingInstructions',nullif(booking_payload->>'declaredValueMinor','')::integer) on conflict(order_id) do nothing;
  insert into public.delivery_status_events(order_id,previous_status,new_status,actor_id,actor_type) values(created_order.id,null,created_order.delivery_status,current_user_id,'customer') on conflict do nothing;
  if created_order.payer <> 'sender' then
    receiver_token := replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-','');
    insert into public.receiver_payment_tokens(order_id,token_hash,expires_at) values(created_order.id,encode(digest(receiver_token,'sha256'),'hex'),now()+interval '48 hours');
  end if;
  return jsonb_build_object('order_id',created_order.id,'order_reference',created_order.order_reference,'tracking_reference',created_order.tracking_reference,'payment_status',created_order.payment_status,'receiver_payment_token',receiver_token);
end;
$$;

create or replace function public.record_verified_payment(payment_intent_id uuid, provider_transaction_id text, event_payload jsonb) returns void language plpgsql security definer set search_path = public as $$
declare selected_intent public.payment_intents%rowtype;
begin
  select * into selected_intent from public.payment_intents where id = payment_intent_id for update;
  if not found or selected_intent.status = 'paid' then return; end if;
  insert into public.payment_transactions(payment_intent_id,order_id,provider_transaction_id,amount_minor,currency,status,immutable_payload) values(selected_intent.id,selected_intent.order_id,provider_transaction_id,selected_intent.amount_minor,selected_intent.currency,'paid',event_payload) on conflict do nothing;
  update public.payment_intents set status='paid',updated_at=now() where id=selected_intent.id;
  update public.delivery_orders set payment_status='paid',updated_at=now() where id=selected_intent.order_id;
  update public.receiver_payment_tokens set consumed_at=now() where id=nullif(event_payload#>>'{data,metadata,receiver_token_id}','')::uuid;
  insert into public.audit_logs(actor_type,action,resource_type,resource_id,metadata) values('system','payment.verified','delivery_order',selected_intent.order_id,jsonb_build_object('payment_intent_id',selected_intent.id));
end;
$$;

create or replace function public.transition_delivery_order(order_id uuid,new_status public.delivery_status,metadata jsonb default '{}'::jsonb) returns void language plpgsql security definer set search_path = public as $$
declare selected_order public.delivery_orders%rowtype; allowed boolean := false; event_actor_id uuid := coalesce(nullif(metadata->>'actorUserId','')::uuid,auth.uid()); event_actor_type text := coalesce(nullif(metadata->>'actorRole',''),case when auth.uid() is null then 'system' else 'admin' end);
begin
  select * into selected_order from public.delivery_orders where id=order_id for update;
  if not found then raise exception 'order not found'; end if;
  allowed := case selected_order.delivery_status
    when 'draft' then new_status in ('awaiting_confirmation','cancelled')
    when 'awaiting_confirmation' then new_status in ('confirmed','cancelled')
    when 'confirmed' then new_status in ('awaiting_assignment','cancelled')
    when 'awaiting_assignment' then new_status in ('assigned','cancelled')
    when 'assigned' then new_status in ('rider_en_route_to_pickup','cancelled')
    when 'rider_en_route_to_pickup' then new_status in ('picked_up','delivery_failed','cancelled')
    when 'picked_up' then new_status in ('in_transit','delivery_failed')
    when 'in_transit' then new_status in ('arrived_at_destination','delivery_failed')
    when 'arrived_at_destination' then new_status in ('awaiting_payment','delivered','delivery_failed')
    when 'awaiting_payment' then new_status in ('delivered','delivery_failed')
    when 'delivery_failed' then new_status in ('awaiting_assignment','cancelled') else false end;
  if not allowed then raise exception 'invalid status transition'; end if;
  if new_status='delivered' and selected_order.payment_status<>'paid' then raise exception 'payment clearance required'; end if;
  update public.delivery_orders set delivery_status=new_status,updated_at=now() where id=order_id;
  insert into public.delivery_status_events(order_id,previous_status,new_status,actor_id,actor_type,metadata) values(order_id,selected_order.delivery_status,new_status,event_actor_id,event_actor_type,metadata);
end;
$$;

alter table public.profiles enable row level security;
alter table public.customer_addresses enable row level security;
alter table public.delivery_orders enable row level security;
alter table public.delivery_packages enable row level security;
alter table public.delivery_status_events enable row level security;
alter table public.payment_intents enable row level security;
alter table public.payment_transactions enable row level security;
alter table public.delivery_proofs enable row level security;
alter table public.notifications enable row level security;
alter table public.support_requests enable row level security;

create policy profiles_own on public.profiles for all using (id=auth.uid()) with check (id=auth.uid());
create policy addresses_own on public.customer_addresses for all using (customer_id=auth.uid()) with check (customer_id=auth.uid());
create policy orders_own_select on public.delivery_orders for select using (customer_id=auth.uid());
create policy packages_own_select on public.delivery_packages for select using (exists(select 1 from public.delivery_orders o where o.id=order_id and o.customer_id=auth.uid()));
create policy events_own_select on public.delivery_status_events for select using (exists(select 1 from public.delivery_orders o where o.id=order_id and o.customer_id=auth.uid()));
create policy intents_own_select on public.payment_intents for select using (exists(select 1 from public.delivery_orders o where o.id=order_id and o.customer_id=auth.uid()));
create policy intents_own_insert on public.payment_intents for insert with check (exists(select 1 from public.delivery_orders o where o.id=order_id and o.customer_id=auth.uid()));
create policy transactions_own_select on public.payment_transactions for select using (exists(select 1 from public.delivery_orders o where o.id=order_id and o.customer_id=auth.uid()));
create policy proofs_own_select on public.delivery_proofs for select using (exists(select 1 from public.delivery_orders o where o.id=order_id and o.customer_id=auth.uid()));
create policy notifications_own on public.notifications for select using (customer_id=auth.uid());
create policy support_own_select on public.support_requests for select using (customer_id=auth.uid());

revoke all on function public.record_verified_payment(uuid,text,jsonb) from public, anon, authenticated;
grant execute on function public.record_verified_payment(uuid,text,jsonb) to service_role;
grant execute on function public.create_delivery_order(jsonb) to authenticated;
revoke all on function public.transition_delivery_order(uuid,public.delivery_status,jsonb) from public, anon, authenticated;
grant execute on function public.transition_delivery_order(uuid,public.delivery_status,jsonb) to service_role;
