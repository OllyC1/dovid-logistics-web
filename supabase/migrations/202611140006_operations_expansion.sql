-- Operations expansion: assisted bookings, multi-parcel delivery runs,
-- supplemental charges, delivery attempts, redelivery and custody history.
-- This migration does not activate bookings, payments, service zones or vehicles.

alter table public.service_area_operational_settings
  add column same_day_booking_cutoff time not null default '20:30',
  add column handover_buffer_minutes integer check (handover_buffer_minutes is null or handover_buffer_minutes between 0 and 240),
  add column safe_completion_buffer_minutes integer check (safe_completion_buffer_minutes is null or safe_completion_buffer_minutes between 0 and 240),
  add column waiting_free_minutes integer check (waiting_free_minutes is null or waiting_free_minutes between 0 and 240),
  add column waiting_fee_per_minute_kobo integer check (waiting_fee_per_minute_kobo is null or waiting_fee_per_minute_kobo >= 0),
  add column maximum_continuous_riding_minutes integer check (maximum_continuous_riding_minutes is null or maximum_continuous_riding_minutes between 15 and 480),
  add column minimum_break_minutes integer check (minimum_break_minutes is null or minimum_break_minutes between 5 and 180),
  add column motorcycle_restrictions_confirmed_at timestamptz,
  add column motorcycle_restrictions_confirmed_by uuid references public.profiles(id) on delete set null,
  add column motorcycle_restrictions_notes text;

update public.service_area_operational_settings
set service_hours = '{"timezone":"Africa/Lagos","monday":["07:00","22:00"],"tuesday":["07:00","22:00"],"wednesday":["07:00","22:00"],"thursday":["07:00","22:00"],"friday":["07:00","22:00"],"saturday":["07:00","22:00"],"sunday":["07:00","22:00"]}'::jsonb,
    same_day_booking_cutoff = '20:30',
    updated_at = now()
where service_area_id = '10000000-0000-4000-8000-000000000001';

alter table public.quotes
  add column booking_origin text not null default 'website'
    check (booking_origin in ('website','whatsapp_admin','phone_admin','other_admin'));

alter table public.delivery_orders
  add column booking_origin text not null default 'website'
    check (booking_origin in ('website','whatsapp_admin','phone_admin','other_admin')),
  add column assisted_booking_draft_id uuid;

alter table public.delivery_packages
  add column weight_grams integer check (weight_grams is null or weight_grams > 0),
  add column length_mm integer check (length_mm is null or length_mm > 0),
  add column width_mm integer check (width_mm is null or width_mm > 0),
  add column height_mm integer check (height_mm is null or height_mm > 0),
  add column compatibility_tags text[] not null default '{}',
  add column pickup_window_start timestamptz,
  add column pickup_window_end timestamptz,
  add column delivery_deadline timestamptz,
  add constraint delivery_packages_pickup_window_check
    check (pickup_window_end is null or pickup_window_start is null or pickup_window_end > pickup_window_start);

alter table public.fleet_vehicles
  add column max_payload_weight_grams integer check (max_payload_weight_grams is null or max_payload_weight_grams > 0),
  add column cargo_length_mm integer check (cargo_length_mm is null or cargo_length_mm > 0),
  add column cargo_width_mm integer check (cargo_width_mm is null or cargo_width_mm > 0),
  add column cargo_height_mm integer check (cargo_height_mm is null or cargo_height_mm > 0),
  add column capacity_verified_at timestamptz,
  add column capacity_verified_by uuid references public.profiles(id) on delete set null;

create table public.assisted_booking_drafts (
  id uuid primary key default gen_random_uuid(),
  booking_origin text not null check (booking_origin in ('whatsapp_admin','phone_admin','other_admin')),
  status text not null default 'draft'
    check (status in ('draft','checking','quoted','awaiting_customer','accepted','order_created','expired','revoked','rejected')),
  customer_id uuid references public.profiles(id) on delete set null,
  customer_name text not null,
  customer_phone text not null,
  phone_source text not null check (phone_source in ('customer_provided','verified_profile','admin_verified')),
  request_payload jsonb not null,
  quote_id uuid references public.quotes(id) on delete restrict,
  quote_payload_hash text,
  order_id uuid references public.delivery_orders(id) on delete restrict,
  created_by uuid not null references public.profiles(id) on delete restrict,
  accepted_by uuid references public.profiles(id) on delete restrict,
  accepted_at timestamptz,
  acceptance_channel text,
  terms_version text,
  affirmative_acceptance jsonb,
  idempotency_key uuid not null unique,
  expires_at timestamptz not null default (now() + interval '48 hours'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index assisted_booking_drafts_status_created_idx on public.assisted_booking_drafts(status,created_at desc);
create index assisted_booking_drafts_phone_idx on public.assisted_booking_drafts(customer_phone,created_at desc);

alter table public.delivery_orders
  add constraint delivery_orders_assisted_booking_draft_fk
  foreign key (assisted_booking_draft_id) references public.assisted_booking_drafts(id) on delete restrict;

create table public.assisted_quote_access_tokens (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null unique references public.assisted_booking_drafts(id) on delete cascade,
  token_hash text not null unique,
  otp_hash text not null,
  otp_expires_at timestamptz not null,
  verified_at timestamptz,
  verification_session_hash text,
  verification_session_expires_at timestamptz,
  failed_attempts integer not null default 0 check (failed_attempts between 0 and 5),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  consumed_at timestamptz,
  acceptance_idempotency_key uuid unique,
  created_at timestamptz not null default now()
);

create table public.assisted_booking_events (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references public.assisted_booking_drafts(id) on delete cascade,
  event_type text not null,
  actor_id uuid references public.profiles(id) on delete set null,
  actor_type text not null check (actor_type in ('customer','admin','system')),
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index assisted_booking_events_draft_created_idx on public.assisted_booking_events(draft_id,created_at);

create or replace function public.prepare_assisted_booking_quote() returns trigger
language plpgsql security definer set search_path=public,extensions as $$
declare quote_payload jsonb;
begin
  if new.quote_id is distinct from old.quote_id and new.quote_id is not null then
    select request_payload into quote_payload from public.quotes where id=new.quote_id;
    if quote_payload is null then raise exception 'assisted quote not found'; end if;
    new.quote_payload_hash := encode(extensions.digest(quote_payload::text,'sha256'),'hex');
    new.status := 'awaiting_customer';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
create trigger assisted_booking_quote_prepare_trigger
before update of quote_id on public.assisted_booking_drafts
for each row execute function public.prepare_assisted_booking_quote();

create table public.whatsapp_contact_opt_ins (
  id uuid primary key default gen_random_uuid(),
  phone_hash text not null,
  status text not null check (status in ('pending','opted_in','opted_out')),
  source text not null,
  evidence jsonb not null default '{}',
  recorded_by uuid references public.profiles(id) on delete set null,
  recorded_at timestamptz not null default now(),
  revoked_at timestamptz
);
create index whatsapp_contact_opt_ins_phone_idx on public.whatsapp_contact_opt_ins(phone_hash,recorded_at desc);

create table public.whatsapp_message_events (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid references public.assisted_booking_drafts(id) on delete set null,
  provider text not null,
  direction text not null check (direction in ('inbound','outbound')),
  template_name text,
  provider_message_id text,
  status text not null check (status in ('drafted','queued','sent','delivered','read','failed','received')),
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  unique(provider,provider_message_id)
);

create table public.delivery_runs (
  id uuid primary key default gen_random_uuid(),
  run_reference text not null unique,
  rider_id uuid not null references public.profiles(id) on delete restrict,
  vehicle_id uuid not null references public.fleet_vehicles(id) on delete restrict,
  status text not null default 'planned'
    check (status in ('planned','active','paused','completed','cancelled')),
  scheduled_start_at timestamptz,
  started_at timestamptz,
  expected_completion_at timestamptz,
  completed_at timestamptz,
  route_distance_meters integer check (route_distance_meters is null or route_distance_meters >= 0),
  route_duration_seconds integer check (route_duration_seconds is null or route_duration_seconds >= 0),
  route_provider text,
  route_snapshot jsonb not null default '{}',
  capacity_snapshot jsonb not null default '{}',
  total_revenue_kobo integer not null default 0 check (total_revenue_kobo >= 0),
  estimated_profit_kobo integer,
  compliance_confirmed_at timestamptz,
  compliance_confirmed_by uuid references public.profiles(id) on delete restrict,
  compliance_notes text,
  version integer not null default 1,
  idempotency_key uuid not null unique,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index delivery_runs_active_vehicle_idx on public.delivery_runs(vehicle_id)
  where status in ('planned','active','paused');
create unique index delivery_runs_active_rider_idx on public.delivery_runs(rider_id)
  where status in ('planned','active','paused');

create table public.delivery_run_stops (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.delivery_runs(id) on delete cascade,
  order_id uuid references public.delivery_orders(id) on delete restrict,
  stop_type text not null check (stop_type in ('pickup','dropoff','break','return_to_sender','authorized_hold')),
  sequence integer not null check (sequence > 0),
  status text not null default 'pending' check (status in ('pending','next','arrived','completed','failed','skipped')),
  address text not null,
  latitude numeric(10,7),
  longitude numeric(10,7),
  window_start timestamptz,
  window_end timestamptz,
  deadline_at timestamptz,
  estimated_arrival_at timestamptz,
  estimated_departure_at timestamptz,
  route_distance_from_previous_meters integer,
  route_duration_from_previous_seconds integer,
  manually_adjusted boolean not null default false,
  adjustment_reason text,
  arrived_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(run_id,sequence),
  unique(run_id,order_id,stop_type),
  check (not manually_adjusted or length(trim(adjustment_reason)) >= 8)
);
create index delivery_run_stops_run_sequence_idx on public.delivery_run_stops(run_id,sequence);

create table public.run_assignments (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.delivery_runs(id) on delete restrict,
  order_id uuid not null references public.delivery_orders(id) on delete restrict,
  delivery_assignment_id uuid references public.delivery_assignments(id) on delete restrict,
  status text not null default 'assigned'
    check (status in ('assigned','not_collected','collected','onboard','delivered','failed','returning','returned','released')),
  package_weight_grams integer,
  package_volume_mm3 bigint,
  compatibility_snapshot jsonb not null default '{}',
  route_snapshot jsonb not null default '{}',
  idempotency_key uuid not null unique,
  assigned_at timestamptz not null default now(),
  released_at timestamptz,
  unique(order_id) deferrable initially immediate
);
create index run_assignments_run_status_idx on public.run_assignments(run_id,status);

alter table public.delivery_assignments add column delivery_run_id uuid references public.delivery_runs(id) on delete restrict;
drop index if exists public.delivery_assignments_active_vehicle_idx;
create index delivery_assignments_active_vehicle_idx on public.delivery_assignments(vehicle_id,assigned_at)
  where released_at is null;

create table public.delivery_run_change_history (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.delivery_runs(id) on delete cascade,
  action text not null,
  previous_snapshot jsonb,
  next_snapshot jsonb not null,
  changed_by uuid references public.profiles(id) on delete set null,
  change_reason text,
  created_at timestamptz not null default now()
);

create table public.parcel_custody_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.delivery_orders(id) on delete restrict,
  run_id uuid references public.delivery_runs(id) on delete restrict,
  rider_id uuid references public.profiles(id) on delete restrict,
  event_type text not null check (event_type in ('assigned','pickup_confirmed','loaded','unloaded','handover_completed','delivery_failed','held','return_started','returned_to_sender','transferred','incident')),
  location jsonb,
  evidence jsonb not null default '{}',
  notes text,
  recorded_by uuid references public.profiles(id) on delete restrict,
  idempotency_key uuid not null unique,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index parcel_custody_events_order_occurred_idx on public.parcel_custody_events(order_id,occurred_at);

create table public.delivery_expense_reports (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.delivery_orders(id) on delete restrict,
  run_id uuid references public.delivery_runs(id) on delete restrict,
  rider_id uuid not null references public.profiles(id) on delete restrict,
  category text not null check (category in ('toll_road_access','authorized_parking_access','waiting_time','extra_stop','address_correction','return_journey','redelivery','other')),
  amount_kobo integer not null check (amount_kobo > 0),
  description text not null,
  location jsonb,
  occurred_at timestamptz not null,
  receipt_storage_path text,
  already_incurred boolean not null,
  customer_approval_obtained boolean not null default false,
  status text not null default 'reported' check (status in ('reported','under_review','approved','rejected','disputed')),
  reviewed_by uuid references public.profiles(id) on delete restrict,
  reviewed_at timestamptz,
  review_reason text,
  idempotency_key uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(rider_id,idempotency_key)
);
create index delivery_expense_reports_status_idx on public.delivery_expense_reports(status,created_at);

create table public.customer_surcharges (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.delivery_orders(id) on delete restrict,
  expense_report_id uuid references public.delivery_expense_reports(id) on delete restrict,
  category text not null,
  description text not null,
  proposed_amount_kobo integer not null check (proposed_amount_kobo > 0),
  approved_amount_kobo integer check (approved_amount_kobo is null or approved_amount_kobo > 0),
  status text not null default 'proposed'
    check (status in ('proposed','customer_approved','payment_pending','paid','rejected','disputed','waived')),
  proposed_by uuid not null references public.profiles(id) on delete restrict,
  admin_approved_by uuid references public.profiles(id) on delete restrict,
  admin_approved_at timestamptz,
  customer_approved_at timestamptz,
  customer_authorization jsonb,
  dispute_reason text,
  idempotency_key uuid not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index customer_surcharges_order_status_idx on public.customer_surcharges(order_id,status);

alter table public.payment_intents
  add column surcharge_id uuid references public.customer_surcharges(id) on delete restrict;
create unique index payment_intents_active_surcharge_idx on public.payment_intents(surcharge_id)
  where surcharge_id is not null and status in ('pending','processing');

create table public.delivery_waiting_sessions (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.delivery_orders(id) on delete restrict,
  run_id uuid references public.delivery_runs(id) on delete restrict,
  rider_id uuid not null references public.profiles(id) on delete restrict,
  started_at timestamptz not null default clock_timestamp(),
  ended_at timestamptz,
  paused_at timestamptz,
  excluded_seconds integer not null default 0 check (excluded_seconds >= 0),
  exclusion_reason text,
  free_waiting_minutes_snapshot integer,
  fee_per_minute_kobo_snapshot integer,
  calculated_charge_kobo integer,
  status text not null default 'running' check (status in ('running','paused','completed','cancelled')),
  idempotency_key uuid not null unique,
  created_at timestamptz not null default now()
);
create unique index delivery_waiting_sessions_active_order_idx on public.delivery_waiting_sessions(order_id)
  where status in ('running','paused');

create table public.delivery_attempts (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.delivery_orders(id) on delete restrict,
  run_id uuid references public.delivery_runs(id) on delete restrict,
  rider_id uuid not null references public.profiles(id) on delete restrict,
  attempt_number integer not null check (attempt_number > 0),
  status text not null check (status in ('attempted','recipient_unavailable','address_problem','recipient_refused','payment_refused','access_blocked','unsafe_delivery','rescheduled','returned_to_sender','incident_escalated')),
  arrival_time timestamptz not null,
  contact_attempts jsonb not null default '[]',
  waiting_duration_seconds integer not null default 0 check (waiting_duration_seconds >= 0),
  failure_reason text,
  evidence jsonb not null default '{}',
  location jsonb,
  rider_notes text,
  admin_decision text,
  admin_decided_by uuid references public.profiles(id) on delete restrict,
  admin_decided_at timestamptz,
  customer_notification_status text not null default 'pending' check (customer_notification_status in ('pending','queued','sent','failed','skipped')),
  idempotency_key uuid not null,
  created_at timestamptz not null default now(),
  unique(rider_id,idempotency_key),
  unique(order_id,attempt_number)
);
create index delivery_attempts_order_created_idx on public.delivery_attempts(order_id,created_at desc);

create table public.redelivery_requests (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.delivery_orders(id) on delete restrict,
  delivery_attempt_id uuid not null references public.delivery_attempts(id) on delete restrict,
  requested_by uuid not null references public.profiles(id) on delete restrict,
  requested_by_role text not null check (requested_by_role in ('customer','admin')),
  status text not null default 'requested' check (status in ('requested','quoted','customer_approved','scheduled','in_progress','completed','rejected','cancelled')),
  corrected_address text,
  corrected_latitude numeric(10,7),
  corrected_longitude numeric(10,7),
  scheduled_at timestamptz,
  charge_attribution text not null check (charge_attribution in ('customer','dovid','waived','under_review')),
  redelivery_quote_id uuid references public.quotes(id) on delete restrict,
  surcharge_id uuid references public.customer_surcharges(id) on delete restrict,
  decision_reason text,
  idempotency_key uuid not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.payer_change_requests (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.delivery_orders(id) on delete restrict,
  requested_by uuid not null references public.profiles(id) on delete restrict,
  previous_payer public.payer_type not null,
  proposed_payer public.payer_type not null,
  status text not null default 'pending' check (status in ('pending','authorized','rejected','expired')),
  authorization_evidence jsonb not null default '{}',
  idempotency_key uuid not null unique,
  decided_by uuid references public.profiles(id) on delete restrict,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.delivery_incidents (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.delivery_orders(id) on delete restrict,
  run_id uuid references public.delivery_runs(id) on delete restrict,
  attempt_id uuid references public.delivery_attempts(id) on delete restrict,
  reported_by uuid not null references public.profiles(id) on delete restrict,
  incident_type text not null check (incident_type in ('safety','damage','loss','custody','payment','other')),
  severity text not null check (severity in ('low','medium','high','critical')),
  description text not null,
  evidence jsonb not null default '{}',
  status text not null default 'open' check (status in ('open','investigating','resolved','closed')),
  resolution text,
  idempotency_key uuid not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.verify_assisted_quote_access(
  access_token_hash text,
  submitted_otp_hash text,
  new_verification_session_hash text
) returns uuid
language plpgsql security definer set search_path=public as $$
declare selected_token public.assisted_quote_access_tokens%rowtype;
begin
  select * into selected_token from public.assisted_quote_access_tokens
  where token_hash=access_token_hash for update;
  if not found or selected_token.revoked_at is not null or selected_token.consumed_at is not null
    or selected_token.expires_at<=now() then raise exception 'quote link is invalid or expired'; end if;
  if selected_token.failed_attempts>=5 then raise exception 'verification attempts exceeded'; end if;
  if selected_token.otp_expires_at<=now() then raise exception 'verification code has expired'; end if;
  if selected_token.otp_hash is distinct from submitted_otp_hash then
    update public.assisted_quote_access_tokens set failed_attempts=failed_attempts+1 where id=selected_token.id;
    raise exception 'verification code is invalid';
  end if;
  update public.assisted_quote_access_tokens
  set verified_at=coalesce(verified_at,now()),verification_session_hash=new_verification_session_hash,
      verification_session_expires_at=now()+interval '30 minutes'
  where id=selected_token.id;
  insert into public.assisted_booking_events(draft_id,event_type,actor_type)
  values(selected_token.draft_id,'contact_verified','customer');
  return selected_token.draft_id;
end;
$$;

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
begin
  if not exists(select 1 from public.profiles where id=actor_customer_id and role='customer') then
    raise exception 'customer authorization required';
  end if;
  select * into selected_token from public.assisted_quote_access_tokens
  where token_hash=access_token_hash for update;
  if not found or selected_token.revoked_at is not null or selected_token.consumed_at is not null
    or selected_token.expires_at<=now() then raise exception 'quote link is invalid or expired'; end if;
  if selected_token.verified_at is null then raise exception 'contact verification is required'; end if;
  if selected_token.verification_session_hash is distinct from verification_session_hash
    or selected_token.verification_session_expires_at is null or selected_token.verification_session_expires_at<=now() then
    raise exception 'verified quote session has expired';
  end if;
  if selected_token.acceptance_idempotency_key is not null
    and selected_token.acceptance_idempotency_key is distinct from acceptance_idempotency then
    raise exception 'quote link has already been accepted';
  end if;
  select * into selected_draft from public.assisted_booking_drafts
  where id=selected_token.draft_id for update;
  if selected_draft.status not in ('quoted','awaiting_customer','accepted') then raise exception 'assisted booking is not awaiting acceptance'; end if;
  select * into selected_quote from public.quotes where id=selected_draft.quote_id for update;
  if not found or selected_quote.expires_at<=now() then raise exception 'quote has expired'; end if;
  if selected_draft.quote_payload_hash is distinct from encode(extensions.digest(selected_quote.request_payload::text,'sha256'),'hex') then
    raise exception 'quote details changed after link creation';
  end if;
  if selected_quote.operational_approval_status not in ('not_required','approved') then
    raise exception 'dispatch approval is still required';
  end if;
  update public.quotes
  set customer_id=actor_customer_id,status='confirmed',confirmed_at=coalesce(confirmed_at,now()),
      confirmation_idempotency_key=acceptance_idempotency,
      request_payload=jsonb_set(request_payload,'{payer}',to_jsonb(selected_payer::text),true)
  where id=selected_quote.id and (customer_id is null or customer_id=actor_customer_id);
  if not found then raise exception 'quote belongs to another customer'; end if;
  update public.assisted_quote_access_tokens
  set acceptance_idempotency_key=acceptance_idempotency
  where id=selected_token.id;
  update public.assisted_booking_drafts
  set status='accepted',customer_id=actor_customer_id,accepted_by=actor_customer_id,
      accepted_at=coalesce(accepted_at,now()),acceptance_channel='secure_quote_link',
      terms_version=acceptance_evidence->>'termsVersion',affirmative_acceptance=acceptance_evidence,
      request_payload=jsonb_set(request_payload,'{payer}',to_jsonb(selected_payer::text),true),updated_at=now()
  where id=selected_draft.id;
  insert into public.assisted_booking_events(draft_id,event_type,actor_id,actor_type,metadata)
  values(selected_draft.id,'quote_accepted',actor_customer_id,'customer',acceptance_evidence);
  return jsonb_build_object('draftId',selected_draft.id,'quoteId',selected_quote.id,'requestPayload',jsonb_set(selected_draft.request_payload,'{payer}',to_jsonb(selected_payer::text),true));
end;
$$;

create or replace function public.complete_assisted_booking(
  target_draft_id uuid,
  target_order_id uuid,
  access_token_hash text
) returns void
language plpgsql security definer set search_path=public as $$
declare selected_draft public.assisted_booking_drafts%rowtype;
begin
  select * into selected_draft from public.assisted_booking_drafts where id=target_draft_id for update;
  if not found or selected_draft.status not in ('accepted','order_created') then raise exception 'assisted booking is not accepted'; end if;
  if not exists(select 1 from public.delivery_orders where id=target_order_id and customer_id=selected_draft.customer_id and quote_id=selected_draft.quote_id) then
    raise exception 'order does not match assisted booking';
  end if;
  update public.assisted_booking_drafts set status='order_created',order_id=target_order_id,updated_at=now() where id=target_draft_id;
  update public.delivery_orders set booking_origin=selected_draft.booking_origin,assisted_booking_draft_id=selected_draft.id where id=target_order_id;
  update public.assisted_quote_access_tokens set consumed_at=coalesce(consumed_at,now()) where draft_id=target_draft_id and token_hash=access_token_hash;
  insert into public.assisted_booking_events(draft_id,event_type,actor_id,actor_type,metadata)
  values(target_draft_id,'order_created',selected_draft.customer_id,'customer',jsonb_build_object('orderId',target_order_id));
end;
$$;

create or replace function public.create_delivery_run(
  target_vehicle_id uuid,
  target_rider_id uuid,
  actor_id uuid,
  target_start_at timestamptz,
  compliance_reason text,
  request_idempotency_key uuid
) returns uuid
language plpgsql security definer set search_path=public as $$
declare selected_vehicle public.fleet_vehicles%rowtype;
declare created_run_id uuid;
begin
  if not exists(select 1 from public.profiles where id=actor_id and role='admin') then raise exception 'admin authorization required'; end if;
  if not exists(select 1 from public.profiles where id=target_rider_id and role='rider') then raise exception 'rider profile required'; end if;
  if length(trim(compliance_reason))<8 then raise exception 'dispatch compliance confirmation is required'; end if;
  select id into created_run_id from public.delivery_runs where idempotency_key=request_idempotency_key;
  if found then return created_run_id; end if;
  select * into selected_vehicle from public.fleet_vehicles where id=target_vehicle_id for update;
  if not found or selected_vehicle.operational_status not in ('available','assigned') or selected_vehicle.safety_status<>'cleared' then
    raise exception 'vehicle is not safely available';
  end if;
  if selected_vehicle.assigned_rider_id is distinct from target_rider_id then raise exception 'vehicle is not assigned to this rider'; end if;
  if exists(select 1 from public.delivery_runs where (vehicle_id=target_vehicle_id or rider_id=target_rider_id) and status in ('planned','active','paused')) then
    raise exception 'rider or vehicle already has an active run';
  end if;
  insert into public.delivery_runs(run_reference,rider_id,vehicle_id,scheduled_start_at,compliance_confirmed_at,compliance_confirmed_by,compliance_notes,idempotency_key,created_by)
  values('RUN-'||to_char(now(),'YYMMDD')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,8)),target_rider_id,target_vehicle_id,target_start_at,now(),actor_id,compliance_reason,request_idempotency_key,actor_id)
  returning id into created_run_id;
  return created_run_id;
end;
$$;

create or replace function public.assign_order_to_delivery_run(
  target_order_id uuid,
  target_run_id uuid,
  actor_id uuid,
  route_snapshot jsonb,
  override_reason text,
  request_idempotency_key uuid
) returns uuid
language plpgsql security definer set search_path=public as $$
declare selected_run public.delivery_runs%rowtype;
declare selected_order public.delivery_orders%rowtype;
declare selected_vehicle public.fleet_vehicles%rowtype;
declare selected_package public.delivery_packages%rowtype;
declare current_weight bigint;
declare current_count integer;
declare created_assignment_id uuid;
declare created_run_assignment_id uuid;
begin
  if not exists(select 1 from public.profiles where id=actor_id and role='admin') then raise exception 'admin authorization required'; end if;
  select id into created_run_assignment_id from public.run_assignments where idempotency_key=request_idempotency_key;
  if found then return created_run_assignment_id; end if;
  select * into selected_run from public.delivery_runs where id=target_run_id for update;
  if not found or selected_run.status not in ('planned','active','paused') then raise exception 'delivery run is not assignable'; end if;
  select * into selected_vehicle from public.fleet_vehicles where id=selected_run.vehicle_id for update;
  if selected_vehicle.safety_status<>'cleared' or selected_vehicle.operational_status not in ('available','assigned') then raise exception 'vehicle is not safely assignable'; end if;
  select * into selected_order from public.delivery_orders where id=target_order_id for update;
  if not found or selected_order.delivery_status<>'awaiting_assignment' then raise exception 'order is not awaiting assignment'; end if;
  select * into selected_package from public.delivery_packages where order_id=target_order_id;
  select count(*),coalesce(sum(package_weight_grams),0) into current_count,current_weight
  from public.run_assignments where run_id=target_run_id and status in ('assigned','not_collected','collected','onboard');
  if current_count>=selected_vehicle.max_active_assignments then raise exception 'vehicle parcel-count capacity exceeded'; end if;
  if current_count>0 and (selected_vehicle.capacity_verified_at is null or selected_vehicle.max_payload_weight_grams is null or selected_package.weight_grams is null) then
    raise exception 'verified package and vehicle capacity is required for multi-parcel assignment';
  end if;
  if selected_vehicle.max_payload_weight_grams is not null and current_weight+coalesce(selected_package.weight_grams,0)>selected_vehicle.max_payload_weight_grams then
    raise exception 'vehicle payload capacity exceeded';
  end if;
  if coalesce((route_snapshot->>'deadlineConflict')::boolean,false) and length(trim(coalesce(override_reason,'')))<8 then
    raise exception 'deadline conflict requires an administrator override reason';
  end if;
  insert into public.delivery_assignments(order_id,vehicle_id,rider_id,assigned_by,score_snapshot,administrator_override,override_reason,delivery_run_id)
  values(target_order_id,selected_run.vehicle_id,selected_run.rider_id,actor_id,route_snapshot,override_reason is not null,override_reason,target_run_id)
  returning id into created_assignment_id;
  insert into public.run_assignments(run_id,order_id,delivery_assignment_id,package_weight_grams,package_volume_mm3,compatibility_snapshot,route_snapshot,idempotency_key)
  values(target_run_id,target_order_id,created_assignment_id,selected_package.weight_grams,
    case when selected_package.length_mm is null or selected_package.width_mm is null or selected_package.height_mm is null then null else selected_package.length_mm::bigint*selected_package.width_mm::bigint*selected_package.height_mm::bigint end,
    jsonb_build_object('tags',selected_package.compatibility_tags),route_snapshot,request_idempotency_key)
  returning id into created_run_assignment_id;
  insert into public.delivery_run_stops(run_id,order_id,stop_type,sequence,address,latitude,longitude,window_start,window_end,deadline_at)
  values
    (target_run_id,target_order_id,'pickup',(select coalesce(max(sequence),0)+1 from public.delivery_run_stops where run_id=target_run_id),selected_order.pickup_address,selected_order.pickup_latitude,selected_order.pickup_longitude,selected_package.pickup_window_start,selected_package.pickup_window_end,null),
    (target_run_id,target_order_id,'dropoff',(select coalesce(max(sequence),0)+1 from public.delivery_run_stops where run_id=target_run_id),selected_order.delivery_address,selected_order.delivery_latitude,selected_order.delivery_longitude,null,null,selected_package.delivery_deadline);
  update public.delivery_orders set rider_id=selected_run.rider_id,delivery_status='assigned',updated_at=now() where id=target_order_id;
  update public.fleet_vehicles set operational_status='assigned',updated_at=now() where id=selected_run.vehicle_id;
  update public.delivery_runs set version=version+1,total_revenue_kobo=total_revenue_kobo+selected_order.quoted_amount_minor,route_snapshot=$4,updated_at=now() where id=target_run_id;
  insert into public.parcel_custody_events(order_id,run_id,rider_id,event_type,evidence,recorded_by,idempotency_key)
  values(target_order_id,target_run_id,selected_run.rider_id,'assigned',jsonb_build_object('deliveryAssignmentId',created_assignment_id),actor_id,gen_random_uuid());
  insert into public.delivery_status_events(order_id,previous_status,new_status,actor_id,actor_type,metadata)
  values(target_order_id,'awaiting_assignment','assigned',actor_id,'admin',jsonb_build_object('runId',target_run_id,'assignmentId',created_assignment_id,'overrideReason',override_reason));
  return created_run_assignment_id;
end;
$$;

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
begin
  select id into created_id from public.delivery_expense_reports where rider_id=actor_id and idempotency_key=request_idempotency_key;
  if found then return created_id; end if;
  if not exists(select 1 from public.profiles where id=actor_id and role in ('rider','admin')) then raise exception 'rider or admin authorization required'; end if;
  if not exists(select 1 from public.delivery_orders where id=target_order_id and (rider_id=actor_id or public.has_role('admin'))) then raise exception 'order is not assigned to this rider'; end if;
  insert into public.delivery_expense_reports(order_id,run_id,rider_id,category,amount_kobo,description,location,occurred_at,receipt_storage_path,already_incurred,customer_approval_obtained,idempotency_key)
  values(target_order_id,target_run_id,actor_id,expense_category,expense_amount_kobo,expense_description,expense_location,expense_occurred_at,receipt_path,cost_already_incurred,customer_approval,request_idempotency_key)
  returning id into created_id;
  return created_id;
end;
$$;

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
begin
  select id into created_id from public.delivery_attempts where rider_id=actor_id and idempotency_key=request_idempotency_key;
  if found then return created_id; end if;
  if not exists(select 1 from public.profiles where id=actor_id and role in ('rider','admin')) then raise exception 'rider or admin authorization required'; end if;
  if not exists(select 1 from public.delivery_orders where id=target_order_id and (rider_id=actor_id or public.has_role('admin'))) then raise exception 'order is not assigned to this rider'; end if;
  select coalesce(max(attempt_number),0)+1 into next_attempt from public.delivery_attempts where order_id=target_order_id;
  insert into public.delivery_attempts(order_id,run_id,rider_id,attempt_number,status,arrival_time,contact_attempts,waiting_duration_seconds,failure_reason,evidence,location,rider_notes,idempotency_key)
  values(target_order_id,target_run_id,actor_id,next_attempt,attempt_status,clock_timestamp(),contact_attempts_payload,waiting_seconds,failure_reason_text,evidence_payload,location_payload,rider_notes_text,request_idempotency_key)
  returning id into created_id;
  insert into public.parcel_custody_events(order_id,run_id,rider_id,event_type,evidence,notes,recorded_by,idempotency_key)
  values(target_order_id,target_run_id,actor_id,'delivery_failed',evidence_payload,rider_notes_text,actor_id,gen_random_uuid());
  return created_id;
end;
$$;

create or replace function public.record_verified_payment(payment_intent_id uuid, provider_transaction_id text, event_payload jsonb) returns void
language plpgsql security definer set search_path=public as $$
declare selected_intent public.payment_intents%rowtype;
begin
  select * into selected_intent from public.payment_intents where id=$1 for update;
  if not found then raise exception 'payment intent not found'; end if;
  if selected_intent.status='paid' then return; end if;
  insert into public.payment_transactions(payment_intent_id,order_id,provider_transaction_id,amount_minor,currency,status,immutable_payload)
  values(selected_intent.id,selected_intent.order_id,$2,selected_intent.amount_minor,selected_intent.currency,'paid',$3)
  on conflict on constraint payment_transactions_payment_intent_id_provider_transaction_key do nothing;
  update public.payment_intents set status='paid',updated_at=now() where id=selected_intent.id;
  if selected_intent.surcharge_id is null then
    update public.delivery_orders set payment_status='paid',updated_at=now() where id=selected_intent.order_id;
  else
    update public.customer_surcharges set status='paid',updated_at=now()
    where id=selected_intent.surcharge_id and status in ('customer_approved','payment_pending');
  end if;
end;
$$;

drop trigger if exists delivery_assignment_release_trigger on public.delivery_orders;
create or replace function public.release_completed_assignment() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if new.delivery_status in ('delivered','delivery_failed','cancelled') and new.delivery_status is distinct from old.delivery_status then
    update public.delivery_assignments set released_at=now(),release_reason=new.delivery_status::text
    where order_id=new.id and released_at is null;
    update public.run_assignments
    set status=case when new.delivery_status='delivered' then 'delivered' when new.delivery_status='delivery_failed' then 'failed' else 'released' end,
        released_at=case when new.delivery_status in ('delivered','cancelled') then now() else released_at end
    where order_id=new.id;
    update public.fleet_vehicles v set operational_status='available',updated_at=now()
    where v.id in (select da.vehicle_id from public.delivery_assignments da where da.order_id=new.id)
      and not exists(select 1 from public.delivery_assignments active where active.vehicle_id=v.id and active.released_at is null);
  end if;
  return new;
end;
$$;
create trigger delivery_assignment_release_trigger
after update of delivery_status on public.delivery_orders
for each row execute function public.release_completed_assignment();

alter table public.assisted_booking_drafts enable row level security;
alter table public.assisted_quote_access_tokens enable row level security;
alter table public.assisted_booking_events enable row level security;
alter table public.whatsapp_contact_opt_ins enable row level security;
alter table public.whatsapp_message_events enable row level security;
alter table public.delivery_runs enable row level security;
alter table public.delivery_run_stops enable row level security;
alter table public.run_assignments enable row level security;
alter table public.delivery_run_change_history enable row level security;
alter table public.parcel_custody_events enable row level security;
alter table public.delivery_expense_reports enable row level security;
alter table public.customer_surcharges enable row level security;
alter table public.delivery_waiting_sessions enable row level security;
alter table public.delivery_attempts enable row level security;
alter table public.redelivery_requests enable row level security;
alter table public.payer_change_requests enable row level security;
alter table public.delivery_incidents enable row level security;

create policy admin_assisted_booking_read on public.assisted_booking_drafts for select to authenticated using (public.has_role('admin'));
create policy admin_assisted_events_read on public.assisted_booking_events for select to authenticated using (public.has_role('admin'));
create policy assisted_tokens_client_deny on public.assisted_quote_access_tokens for all to anon,authenticated using (false) with check (false);
create policy whatsapp_opt_ins_client_deny on public.whatsapp_contact_opt_ins for all to anon,authenticated using (false) with check (false);
create policy whatsapp_events_client_deny on public.whatsapp_message_events for all to anon,authenticated using (false) with check (false);
create policy admin_delivery_runs_read on public.delivery_runs for select to authenticated using (public.has_role('admin'));
create policy rider_delivery_runs_read on public.delivery_runs for select to authenticated using (rider_id=auth.uid());
create policy admin_delivery_run_stops_read on public.delivery_run_stops for select to authenticated using (public.has_role('admin'));
create policy rider_delivery_run_stops_read on public.delivery_run_stops for select to authenticated using (exists(select 1 from public.delivery_runs r where r.id=run_id and r.rider_id=auth.uid()));
create policy admin_run_assignments_read on public.run_assignments for select to authenticated using (public.has_role('admin'));
create policy rider_run_assignments_read on public.run_assignments for select to authenticated using (exists(select 1 from public.delivery_runs r where r.id=run_id and r.rider_id=auth.uid()));
create policy admin_run_history_read on public.delivery_run_change_history for select to authenticated using (public.has_role('admin'));
create policy admin_custody_read on public.parcel_custody_events for select to authenticated using (public.has_role('admin'));
create policy rider_custody_read on public.parcel_custody_events for select to authenticated using (rider_id=auth.uid());
create policy admin_expenses_read on public.delivery_expense_reports for select to authenticated using (public.has_role('admin'));
create policy rider_expenses_read on public.delivery_expense_reports for select to authenticated using (rider_id=auth.uid());
create policy admin_surcharges_read on public.customer_surcharges for select to authenticated using (public.has_role('admin'));
create policy customer_surcharges_read on public.customer_surcharges for select to authenticated using (exists(select 1 from public.delivery_orders o where o.id=order_id and o.customer_id=auth.uid()));
create policy admin_waiting_read on public.delivery_waiting_sessions for select to authenticated using (public.has_role('admin'));
create policy rider_waiting_read on public.delivery_waiting_sessions for select to authenticated using (rider_id=auth.uid());
create policy admin_attempts_read on public.delivery_attempts for select to authenticated using (public.has_role('admin'));
create policy rider_attempts_read on public.delivery_attempts for select to authenticated using (rider_id=auth.uid());
create policy admin_redelivery_read on public.redelivery_requests for select to authenticated using (public.has_role('admin'));
create policy customer_redelivery_read on public.redelivery_requests for select to authenticated using (exists(select 1 from public.delivery_orders o where o.id=order_id and o.customer_id=auth.uid()));
create policy admin_payer_changes_read on public.payer_change_requests for select to authenticated using (public.has_role('admin'));
create policy customer_payer_changes_read on public.payer_change_requests for select to authenticated using (exists(select 1 from public.delivery_orders o where o.id=order_id and o.customer_id=auth.uid()));
create policy admin_incidents_read on public.delivery_incidents for select to authenticated using (public.has_role('admin'));
create policy rider_incidents_read on public.delivery_incidents for select to authenticated using (reported_by=auth.uid());

grant select on public.assisted_booking_drafts,public.assisted_booking_events,public.delivery_runs,
  public.delivery_run_stops,public.run_assignments,public.delivery_run_change_history,
  public.parcel_custody_events,public.delivery_expense_reports,public.customer_surcharges,
  public.delivery_waiting_sessions,public.delivery_attempts,public.redelivery_requests,
  public.payer_change_requests,public.delivery_incidents to authenticated;

revoke insert,update,delete on public.assisted_booking_drafts,public.assisted_quote_access_tokens,
  public.assisted_booking_events,public.whatsapp_contact_opt_ins,public.whatsapp_message_events,
  public.delivery_runs,public.delivery_run_stops,public.run_assignments,public.delivery_run_change_history,
  public.parcel_custody_events,public.delivery_expense_reports,public.customer_surcharges,
  public.delivery_waiting_sessions,public.delivery_attempts,public.redelivery_requests,
  public.payer_change_requests,public.delivery_incidents from anon,authenticated;

revoke all on function public.verify_assisted_quote_access(text,text,text) from public,anon,authenticated;
revoke all on function public.accept_assisted_quote(text,text,uuid,public.payer_type,uuid,jsonb) from public,anon,authenticated;
revoke all on function public.complete_assisted_booking(uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.create_delivery_run(uuid,uuid,uuid,timestamptz,text,uuid) from public,anon,authenticated;
revoke all on function public.assign_order_to_delivery_run(uuid,uuid,uuid,jsonb,text,uuid) from public,anon,authenticated;
revoke all on function public.report_delivery_expense(uuid,uuid,uuid,text,integer,text,jsonb,timestamptz,text,boolean,boolean,uuid) from public,anon,authenticated;
revoke all on function public.record_delivery_attempt(uuid,uuid,uuid,text,jsonb,integer,text,jsonb,jsonb,text,uuid) from public,anon,authenticated;
revoke all on function public.record_verified_payment(uuid,text,jsonb) from public,anon,authenticated;
revoke all on function public.release_completed_assignment() from public,anon,authenticated;
revoke all on function public.prepare_assisted_booking_quote() from public,anon,authenticated;

grant execute on function public.verify_assisted_quote_access(text,text,text) to service_role;
grant execute on function public.accept_assisted_quote(text,text,uuid,public.payer_type,uuid,jsonb) to service_role;
grant execute on function public.complete_assisted_booking(uuid,uuid,text) to service_role;
grant execute on function public.create_delivery_run(uuid,uuid,uuid,timestamptz,text,uuid) to service_role;
grant execute on function public.assign_order_to_delivery_run(uuid,uuid,uuid,jsonb,text,uuid) to service_role;
grant execute on function public.report_delivery_expense(uuid,uuid,uuid,text,integer,text,jsonb,timestamptz,text,boolean,boolean,uuid) to service_role;
grant execute on function public.record_delivery_attempt(uuid,uuid,uuid,text,jsonb,integer,text,jsonb,jsonb,text,uuid) to service_role;
grant execute on function public.record_verified_payment(uuid,text,jsonb) to service_role;

