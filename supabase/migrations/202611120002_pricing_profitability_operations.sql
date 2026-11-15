create type public.app_role as enum ('customer','rider','admin');

alter table public.profiles add column role public.app_role not null default 'customer';

create or replace function public.has_role(required_role public.app_role) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.profiles where id=auth.uid() and role=required_role);
$$;

create table public.pricing_configurations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  city text not null,
  currency char(3) not null default 'NGN',
  timezone text not null default 'Africa/Lagos',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.pricing_configuration_versions (
  id uuid primary key default gen_random_uuid(),
  pricing_configuration_id uuid not null references public.pricing_configurations(id) on delete restrict,
  version integer not null check (version > 0),
  assumptions jsonb not null,
  status text not null default 'draft' check (status in ('draft','scheduled','active','retired')),
  effective_at timestamptz not null,
  retired_at timestamptz,
  change_reason text not null,
  created_by uuid references public.profiles(id) on delete restrict,
  updated_by uuid references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (pricing_configuration_id, version),
  check (jsonb_typeof(assumptions)='object')
);

create unique index one_active_pricing_version_per_configuration on public.pricing_configuration_versions(pricing_configuration_id) where status='active';

create table public.rate_cards (
  id uuid primary key default gen_random_uuid(),
  configuration_version_id uuid not null references public.pricing_configuration_versions(id) on delete restrict,
  service_area_id uuid references public.service_areas(id) on delete restrict,
  business_account_id uuid,
  name text not null,
  service_level text not null default 'standard' check (service_level in ('standard','express','scheduled')),
  provisional boolean not null default true,
  active boolean not null default true,
  effective_at timestamptz not null,
  expires_at timestamptz,
  created_by uuid references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  check (expires_at is null or expires_at > effective_at)
);

create table public.rate_card_bands (
  id uuid primary key default gen_random_uuid(),
  rate_card_id uuid not null references public.rate_cards(id) on delete restrict,
  position integer not null check (position >= 0),
  minimum_distance_meters integer not null check (minimum_distance_meters >= 0),
  maximum_distance_meters integer check (maximum_distance_meters is null or maximum_distance_meters >= minimum_distance_meters),
  price_kobo integer not null check (price_kobo >= 0),
  additional_per_kilometer_kobo integer check (additional_per_kilometer_kobo is null or additional_per_kilometer_kobo >= 0),
  created_at timestamptz not null default now(),
  unique (rate_card_id, position),
  unique (rate_card_id, minimum_distance_meters)
);

alter table public.quotes
  alter column pricing_rule_id drop not null,
  add column pricing_configuration_version_id uuid references public.pricing_configuration_versions(id) on delete restrict,
  add column rate_card_id uuid references public.rate_cards(id) on delete restrict,
  add column status text not null default 'created' check (status in ('created','confirmed','expired','replaced','cancelled')),
  add column service_level text not null default 'standard' check (service_level in ('standard','express','scheduled')),
  add column payment_method text check (payment_method in ('online','bank_transfer')),
  add column duration_seconds integer,
  add column customer_breakdown jsonb not null default '[]'::jsonb,
  add column internal_breakdown jsonb,
  add column pricing_flags text[] not null default '{}',
  add column confirmed_at timestamptz,
  add column confirmation_idempotency_key uuid;

create unique index quotes_confirmation_idempotency_idx on public.quotes(customer_id,confirmation_idempotency_key) where confirmation_idempotency_key is not null;

create table public.quote_cost_estimates (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null unique references public.quotes(id) on delete restrict,
  estimated_operational_cost_kobo integer not null check (estimated_operational_cost_kobo >= 0),
  minimum_profitable_price_kobo integer not null check (minimum_profitable_price_kobo >= 0),
  estimated_payment_fee_kobo integer not null check (estimated_payment_fee_kobo >= 0),
  estimated_tax_kobo integer not null check (estimated_tax_kobo >= 0),
  estimated_profit_kobo integer not null,
  estimated_operating_margin_bps integer not null,
  assumptions_snapshot jsonb not null,
  created_at timestamptz not null default now()
);

create table public.competitors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  website text,
  city text not null,
  service_coverage text,
  delivery_category text not null,
  pricing_model text,
  published_starting_price_kobo integer check (published_starting_price_kobo is null or published_starting_price_kobo >= 0),
  source_url text,
  source_type text not null check (source_type in ('website','manual_quote','csv_import','approved_provider')),
  date_verified date,
  verification_status text not null default 'unverified' check (verification_status in ('unverified','verified','stale','rejected')),
  notes text,
  created_by uuid references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.competitor_quotes (
  id uuid primary key default gen_random_uuid(),
  competitor_id uuid not null references public.competitors(id) on delete restrict,
  service_area_id uuid references public.service_areas(id) on delete restrict,
  pickup_latitude numeric(10,7) not null,
  pickup_longitude numeric(10,7) not null,
  pickup_zone text,
  dropoff_latitude numeric(10,7) not null,
  dropoff_longitude numeric(10,7) not null,
  dropoff_zone text,
  road_distance_meters integer not null check (road_distance_meters >= 0),
  package_category text not null,
  package_weight_grams integer check (package_weight_grams is null or package_weight_grams >= 0),
  service_level text not null check (service_level in ('standard','express','scheduled')),
  quoted_total_kobo integer not null check (quoted_total_kobo > 0),
  tax_included boolean,
  surcharges_kobo integer not null default 0 check (surcharges_kobo >= 0),
  quoted_at timestamptz not null,
  expires_at timestamptz,
  evidence_url text,
  verification_method text not null,
  verification_status text not null default 'unverified' check (verification_status in ('unverified','verified','stale','rejected')),
  comparable boolean not null default false,
  notes text,
  created_by uuid references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  check (expires_at is null or expires_at > quoted_at)
);

create index competitor_quotes_eligibility_idx on public.competitor_quotes(service_area_id,service_level,verification_status,quoted_at desc) where comparable=true;

create table public.promotions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  kind text not null check (kind in ('fixed','percentage')),
  value integer not null check (value > 0),
  maximum_discount_kobo integer check (maximum_discount_kobo is null or maximum_discount_kobo > 0),
  stackable boolean not null default false,
  active boolean not null default false,
  starts_at timestamptz not null,
  ends_at timestamptz,
  eligibility jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  check (ends_at is null or ends_at > starts_at)
);

create table public.delivery_expenses (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.delivery_orders(id) on delete restrict,
  rider_id uuid references public.profiles(id) on delete restrict,
  expense_type text not null,
  estimated_amount_kobo integer check (estimated_amount_kobo is null or estimated_amount_kobo >= 0),
  actual_amount_kobo integer check (actual_amount_kobo is null or actual_amount_kobo >= 0),
  evidence_storage_path text,
  notes text,
  recorded_by uuid references public.profiles(id) on delete restrict,
  incurred_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table public.rider_compensation_plans (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  version integer not null,
  base_salary_monthly_kobo integer not null check (base_salary_monthly_kobo >= 0),
  maximum_bonus_monthly_kobo integer not null check (maximum_bonus_monthly_kobo >= 0),
  metric_weights jsonb not null,
  effective_at timestamptz not null,
  status text not null default 'draft' check (status in ('draft','active','retired')),
  change_reason text not null,
  created_by uuid references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (name, version)
);

create table public.rider_performance_records (
  id uuid primary key default gen_random_uuid(),
  rider_id uuid not null references public.profiles(id) on delete restrict,
  period_start date not null,
  period_end date not null,
  productivity_bps integer not null check (productivity_bps between 0 and 10000),
  on_time_bps integer not null check (on_time_bps between 0 and 10000),
  customer_satisfaction_bps integer not null check (customer_satisfaction_bps between 0 and 10000),
  safety_and_handling_bps integer not null check (safety_and_handling_bps between 0 and 10000),
  attendance_bps integer not null check (attendance_bps between 0 and 10000),
  excluded_factors jsonb not null default '[]'::jsonb,
  evidence jsonb not null default '{}'::jsonb,
  calculated_by uuid references public.profiles(id) on delete restrict,
  calculated_at timestamptz not null default now(),
  check (period_end >= period_start),
  unique (rider_id, period_start, period_end)
);

create table public.rider_monthly_bonuses (
  id uuid primary key default gen_random_uuid(),
  rider_id uuid not null references public.profiles(id) on delete restrict,
  compensation_plan_id uuid not null references public.rider_compensation_plans(id) on delete restrict,
  performance_record_id uuid not null references public.rider_performance_records(id) on delete restrict,
  month date not null,
  projected_bonus_kobo integer not null check (projected_bonus_kobo >= 0),
  finalized_bonus_kobo integer check (finalized_bonus_kobo is null or finalized_bonus_kobo >= 0),
  status text not null default 'projected' check (status in ('projected','approved','paid','cancelled')),
  finalized_by uuid references public.profiles(id) on delete restrict,
  finalized_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  unique (rider_id, month)
);

create table public.payment_reconciliations (
  id uuid primary key default gen_random_uuid(),
  payment_intent_id uuid not null references public.payment_intents(id) on delete restrict,
  reconciliation_type text not null check (reconciliation_type in ('provider_webhook','bank_feed','manual_review')),
  status text not null check (status in ('pending','matched','rejected')),
  external_reference text,
  amount_kobo integer not null check (amount_kobo > 0),
  evidence jsonb not null default '{}'::jsonb,
  reconciled_by uuid references public.profiles(id) on delete restrict,
  reconciled_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.recurring_pickup_schedules (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles(id) on delete restrict,
  name text not null,
  pickup_address_id uuid references public.customer_addresses(id) on delete restrict,
  recurrence_rule text not null,
  service_level text not null default 'scheduled' check (service_level in ('standard','express','scheduled')),
  preferred_time time,
  active boolean not null default true,
  next_occurrence_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.delivery_feedback (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.delivery_orders(id) on delete restrict,
  customer_id uuid not null references public.profiles(id) on delete restrict,
  rating integer not null check (rating between 1 and 5),
  on_time_rating integer check (on_time_rating between 1 and 5),
  handling_rating integer check (handling_rating between 1 and 5),
  comment text,
  moderation_status text not null default 'pending' check (moderation_status in ('pending','approved','rejected')),
  created_at timestamptz not null default now()
);

create table public.referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_id uuid not null references public.profiles(id) on delete restrict,
  referral_code text not null unique default upper(substr(md5(gen_random_uuid()::text),1,10)),
  referred_customer_id uuid unique references public.profiles(id) on delete restrict,
  status text not null default 'issued' check (status in ('issued','registered','qualified','rewarded','expired')),
  reward_promotion_id uuid references public.promotions(id) on delete restrict,
  qualified_at timestamptz,
  rewarded_at timestamptz,
  created_at timestamptz not null default now(),
  check (referred_customer_id is null or referred_customer_id <> referrer_id)
);

alter table public.delivery_orders
  add column pricing_configuration_version_id uuid references public.pricing_configuration_versions(id) on delete restrict,
  add column pricing_snapshot jsonb,
  add column service_level text not null default 'standard' check (service_level in ('standard','express','scheduled')),
  add column scheduled_at timestamptz,
  add column additional_stops jsonb not null default '[]'::jsonb check (jsonb_typeof(additional_stops)='array'),
  add column oversized boolean not null default false;

create index quotes_config_version_idx on public.quotes(pricing_configuration_version_id,created_at desc);
create index delivery_expenses_order_idx on public.delivery_expenses(order_id,incurred_at);
create index rider_performance_period_idx on public.rider_performance_records(rider_id,period_start desc);

alter table public.pricing_configurations enable row level security;
alter table public.pricing_configuration_versions enable row level security;
alter table public.rate_cards enable row level security;
alter table public.rate_card_bands enable row level security;
alter table public.quote_cost_estimates enable row level security;
alter table public.competitors enable row level security;
alter table public.competitor_quotes enable row level security;
alter table public.promotions enable row level security;
alter table public.delivery_expenses enable row level security;
alter table public.rider_compensation_plans enable row level security;
alter table public.rider_performance_records enable row level security;
alter table public.rider_monthly_bonuses enable row level security;
alter table public.payment_reconciliations enable row level security;
alter table public.recurring_pickup_schedules enable row level security;
alter table public.delivery_feedback enable row level security;
alter table public.referrals enable row level security;
alter table public.quotes enable row level security;

create policy admin_pricing_configurations on public.pricing_configurations for all using (public.has_role('admin')) with check (public.has_role('admin'));
create policy admin_pricing_versions on public.pricing_configuration_versions for all using (public.has_role('admin')) with check (public.has_role('admin'));
create policy admin_rate_cards on public.rate_cards for all using (public.has_role('admin')) with check (public.has_role('admin'));
create policy admin_rate_card_bands on public.rate_card_bands for all using (public.has_role('admin')) with check (public.has_role('admin'));
create policy admin_quote_cost_estimates on public.quote_cost_estimates for select using (public.has_role('admin'));
create policy admin_competitors on public.competitors for all using (public.has_role('admin')) with check (public.has_role('admin'));
create policy admin_competitor_quotes on public.competitor_quotes for all using (public.has_role('admin')) with check (public.has_role('admin'));
create policy admin_promotions on public.promotions for all using (public.has_role('admin')) with check (public.has_role('admin'));
create policy admin_delivery_expenses on public.delivery_expenses for all using (public.has_role('admin')) with check (public.has_role('admin'));
create policy rider_own_delivery_expenses on public.delivery_expenses for select using (rider_id=auth.uid());
create policy admin_compensation_plans on public.rider_compensation_plans for all using (public.has_role('admin')) with check (public.has_role('admin'));
create policy admin_performance_records on public.rider_performance_records for all using (public.has_role('admin')) with check (public.has_role('admin'));
create policy rider_own_performance_records on public.rider_performance_records for select using (rider_id=auth.uid());
create policy admin_monthly_bonuses on public.rider_monthly_bonuses for all using (public.has_role('admin')) with check (public.has_role('admin'));
create policy rider_own_monthly_bonuses on public.rider_monthly_bonuses for select using (rider_id=auth.uid());
create policy admin_payment_reconciliations on public.payment_reconciliations for all using (public.has_role('admin')) with check (public.has_role('admin'));
create policy customer_own_recurring_pickups on public.recurring_pickup_schedules for all using (customer_id=auth.uid()) with check (customer_id=auth.uid());
create policy admin_recurring_pickups on public.recurring_pickup_schedules for all using (public.has_role('admin')) with check (public.has_role('admin'));
create policy customer_own_feedback on public.delivery_feedback for select using (customer_id=auth.uid());
create policy customer_create_feedback on public.delivery_feedback for insert with check (customer_id=auth.uid() and exists(select 1 from public.delivery_orders o where o.id=order_id and o.customer_id=auth.uid() and o.delivery_status='delivered'));
create policy admin_delivery_feedback on public.delivery_feedback for all using (public.has_role('admin')) with check (public.has_role('admin'));
create policy customer_own_referrals on public.referrals for select using (referrer_id=auth.uid() or referred_customer_id=auth.uid());
create policy customer_create_referral on public.referrals for insert with check (referrer_id=auth.uid() and referred_customer_id is null and status='issued');
create policy admin_referrals on public.referrals for all using (public.has_role('admin')) with check (public.has_role('admin'));
create policy quotes_own_select on public.quotes for select using (customer_id=auth.uid());
create policy admin_quotes_select on public.quotes for select using (public.has_role('admin'));
create policy admin_orders_select on public.delivery_orders for select using (public.has_role('admin'));
create policy rider_assigned_orders_select on public.delivery_orders for select using (rider_id=auth.uid() and public.has_role('rider'));
create policy admin_packages_select on public.delivery_packages for select using (public.has_role('admin'));
create policy rider_assigned_packages_select on public.delivery_packages for select using (exists(select 1 from public.delivery_orders o where o.id=order_id and o.rider_id=auth.uid()));
create policy admin_status_events_select on public.delivery_status_events for select using (public.has_role('admin'));
create policy rider_assigned_status_events_select on public.delivery_status_events for select using (exists(select 1 from public.delivery_orders o where o.id=order_id and o.rider_id=auth.uid()));

revoke all on function public.has_role(public.app_role) from public, anon;
grant execute on function public.has_role(public.app_role) to authenticated, service_role;

do $$
declare
  configuration_id uuid := gen_random_uuid();
  version_id uuid := gen_random_uuid();
  rate_card_id uuid := gen_random_uuid();
begin
  insert into public.pricing_configurations(id,name,city,currency,timezone,active)
  values(configuration_id,'Ibadan launch pricing','Ibadan','NGN','Africa/Lagos',true);

  insert into public.pricing_configuration_versions(id,pricing_configuration_id,version,assumptions,status,effective_at,change_reason)
  values(version_id,configuration_id,1,'{
    "version":1,"currency":"NGN","timezone":"Africa/Lagos","fleetSize":2,"workingDaysPerMonth":26,
    "riderBaseSalaryMonthlyKobo":10000000,"riderMaximumBonusMonthlyKobo":3000000,
    "fuelPricePerLitreKobo":137000,"motorcycleFuelEfficiencyKmPerLitre":35,
    "maintenanceReservePerKmKobo":2000,"depreciationReservePerKmKobo":2000,
    "overheadPerBikeMonthlyKobo":5000000,"targetDeliveriesPerBikePerDay":10,
    "targetOperatingMarginBps":2000,"competitorDiscountTargetBps":1000,
    "minimumCustomerFareKobo":180000,"estimatedEmptyKmPerOrderMilli":3000,
    "freeWaitingMinutes":10,"waitingBlockMinutes":5,"waitingFeePerBlockKobo":10000,
    "roundingIncrementKobo":5000,"expressPremiumBps":3500,"scheduledPremiumKobo":0,
    "extraStopFeeKobo":50000,"oversizedHandlingFeeKobo":0,"weatherSurchargeBps":1000,
    "returnDeliveryBps":10000,"taxRateBps":0,"taxTreatment":"none",
    "paymentPercentageFeeBps":{"online":0,"bank_transfer":0},
    "paymentFixedFeeKobo":{"online":0,"bank_transfer":0},
    "expectedFailedDeliveryCost":{"amountKobo":0,"justification":"Planning default pending measured failed-delivery data."},
    "expectedReturnDeliveryCost":{"amountKobo":0,"justification":"Return delivery is charged separately when selected."},
    "routeSpecificOperationalCost":{"amountKobo":0,"justification":"No route-specific expense has been approved for the launch rate card."},
    "minimumCompetitorSamples":3,"competitorFreshnessDays":30
  }'::jsonb,'active',now(),'Initial planning assumptions supplied by the founders; provisional and subject to operational validation.');

  insert into public.rate_cards(id,configuration_version_id,name,service_level,provisional,active,effective_at)
  values(rate_card_id,version_id,'Ibadan provisional standard rate card','standard',true,true,now());

  insert into public.rate_card_bands(rate_card_id,position,minimum_distance_meters,maximum_distance_meters,price_kobo,additional_per_kilometer_kobo) values
  (rate_card_id,0,0,3000,180000,null),
  (rate_card_id,1,3001,5000,200000,null),
  (rate_card_id,2,5001,8000,230000,null),
  (rate_card_id,3,8001,12000,270000,null),
  (rate_card_id,4,12001,17000,330000,null),
  (rate_card_id,5,17001,22000,400000,null),
  (rate_card_id,6,22001,null,400000,22000);

  insert into public.rider_compensation_plans(name,version,base_salary_monthly_kobo,maximum_bonus_monthly_kobo,metric_weights,effective_at,status,change_reason)
  values('Launch rider compensation',1,10000000,3000000,'{"productivityKobo":1000000,"onTimeKobo":750000,"customerSatisfactionKobo":500000,"safetyAndHandlingKobo":500000,"attendanceKobo":250000}'::jsonb,now(),'active','Initial compensation assumptions supplied by the founders.');
end $$;

create or replace function public.activate_pricing_configuration_version(target_version_id uuid, reason text) returns void
language plpgsql security definer set search_path=public as $$
declare target public.pricing_configuration_versions%rowtype;
begin
  if not public.has_role('admin') then raise exception 'admin authorization required'; end if;
  if length(trim(reason)) < 5 then raise exception 'activation reason required'; end if;
  select * into target from public.pricing_configuration_versions where id=target_version_id for update;
  if not found then raise exception 'pricing version not found'; end if;
  update public.pricing_configuration_versions set status='retired',retired_at=now(),updated_by=auth.uid(),updated_at=now() where pricing_configuration_id=target.pricing_configuration_id and status='active';
  update public.pricing_configuration_versions set status='active',effective_at=greatest(effective_at,now()),updated_by=auth.uid(),updated_at=now(),change_reason=reason where id=target_version_id;
  insert into public.audit_logs(actor_id,actor_type,action,resource_type,resource_id,metadata) values(auth.uid(),'admin','pricing.version.activated','pricing_configuration_version',target_version_id,jsonb_build_object('reason',reason));
end;
$$;

revoke all on function public.activate_pricing_configuration_version(uuid,text) from public,anon;
grant execute on function public.activate_pricing_configuration_version(uuid,text) to authenticated,service_role;

create or replace function public.activate_rate_card(target_rate_card_id uuid) returns void
language plpgsql security definer set search_path=public as $$
declare target public.rate_cards%rowtype;
begin
  if not public.has_role('admin') then raise exception 'admin authorization required'; end if;
  select * into target from public.rate_cards where id=target_rate_card_id for update;
  if not found then raise exception 'rate card not found'; end if;
  update public.rate_cards set active=false
  where id<>target.id and active=true and service_level=target.service_level
    and ((service_area_id=target.service_area_id) or (service_area_id is null and target.service_area_id is null));
  update public.rate_cards set active=true where id=target.id;
  insert into public.audit_logs(actor_id,actor_type,action,resource_type,resource_id,metadata)
  values(auth.uid(),'admin','pricing.rate_card.activated','rate_card',target.id,jsonb_build_object('serviceLevel',target.service_level,'serviceAreaId',target.service_area_id));
end;
$$;

revoke all on function public.activate_rate_card(uuid) from public,anon;
grant execute on function public.activate_rate_card(uuid) to authenticated,service_role;

create or replace function public.create_delivery_order(booking_payload jsonb) returns jsonb
language plpgsql security definer set search_path=public as $$
declare
  current_user_id uuid := auth.uid();
  selected_quote public.quotes%rowtype;
  created_order public.delivery_orders%rowtype;
  order_ref text;
  tracking_ref text;
  receiver_token text;
begin
  if current_user_id is null then raise exception 'authentication required'; end if;
  select * into selected_quote from public.quotes where id=(booking_payload->>'quoteId')::uuid and customer_id=current_user_id and status='confirmed' and expires_at>now() for update;
  if not found then raise exception 'confirmed quote is missing or expired'; end if;
  if selected_quote.request_payload->>'pickupAddress' is distinct from booking_payload->>'pickupAddress'
    or selected_quote.request_payload->>'deliveryAddress' is distinct from booking_payload->>'deliveryAddress'
    or selected_quote.request_payload->>'packageSize' is distinct from booking_payload->>'packageSize'
    or selected_quote.request_payload->>'packageCategory' is distinct from booking_payload->>'packageCategory'
    or selected_quote.request_payload->'additionalStops' is distinct from coalesce(booking_payload->'additionalStops','[]'::jsonb)
    or selected_quote.request_payload->>'oversized' is distinct from coalesce(booking_payload->>'oversized','false')
    or selected_quote.service_level is distinct from coalesce(booking_payload->>'serviceLevel','standard')
    or selected_quote.payment_method is distinct from booking_payload->>'paymentMethod'
  then raise exception 'booking does not match confirmed quote'; end if;
  order_ref := 'DOV-'||to_char(now(),'YYMMDD')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));
  tracking_ref := 'TRK-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,14));
  insert into public.delivery_orders(customer_id,quote_id,pricing_configuration_version_id,pricing_snapshot,order_reference,tracking_reference,idempotency_key,pickup_address,pickup_latitude,pickup_longitude,pickup_instructions,delivery_address,delivery_latitude,delivery_longitude,delivery_instructions,sender_name,sender_phone,recipient_name,recipient_phone,payer,payment_method,service_level,scheduled_at,additional_stops,oversized,distance_meters,quoted_amount_minor,currency)
  values(current_user_id,selected_quote.id,selected_quote.pricing_configuration_version_id,jsonb_build_object('quoteId',selected_quote.id,'customerTotalKobo',selected_quote.amount_minor,'currency',selected_quote.currency,'includedCharges',selected_quote.customer_breakdown,'configurationVersionId',selected_quote.pricing_configuration_version_id,'rateCardId',selected_quote.rate_card_id,'serviceDetails',jsonb_build_object('serviceLevel',selected_quote.service_level,'additionalStops',selected_quote.request_payload->'additionalStops','oversized',selected_quote.request_payload->'oversized')),order_ref,tracking_ref,(booking_payload->>'idempotencyKey')::uuid,booking_payload->>'pickupAddress',(booking_payload#>>'{pickupCoordinates,latitude}')::numeric,(booking_payload#>>'{pickupCoordinates,longitude}')::numeric,booking_payload->>'pickupInstructions',booking_payload->>'deliveryAddress',(booking_payload#>>'{deliveryCoordinates,latitude}')::numeric,(booking_payload#>>'{deliveryCoordinates,longitude}')::numeric,booking_payload->>'deliveryInstructions',booking_payload->>'senderName',booking_payload->>'senderPhone',booking_payload->>'recipientName',booking_payload->>'recipientPhone',(booking_payload->>'payer')::public.payer_type,booking_payload->>'paymentMethod',coalesce(booking_payload->>'serviceLevel','standard'),nullif(booking_payload->>'scheduledAt','')::timestamptz,coalesce(booking_payload->'additionalStops','[]'::jsonb),coalesce((booking_payload->>'oversized')::boolean,false),selected_quote.distance_meters,selected_quote.amount_minor,selected_quote.currency)
  on conflict(customer_id,idempotency_key) do update set updated_at=public.delivery_orders.updated_at returning * into created_order;
  insert into public.delivery_packages(order_id,category,size,description,handling_instructions,declared_value_minor) values(created_order.id,booking_payload->>'packageCategory',booking_payload->>'packageSize',booking_payload->>'packageDescription',booking_payload->>'handlingInstructions',nullif(booking_payload->>'declaredValueMinor','')::integer) on conflict(order_id) do nothing;
  insert into public.delivery_status_events(order_id,previous_status,new_status,actor_id,actor_type)
  select created_order.id,null,created_order.delivery_status,current_user_id,'customer'
  where not exists(select 1 from public.delivery_status_events where order_id=created_order.id and previous_status is null and new_status=created_order.delivery_status);
  if created_order.payer<>'sender' and not exists(select 1 from public.receiver_payment_tokens where order_id=created_order.id) then
    receiver_token:=replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','');
    insert into public.receiver_payment_tokens(order_id,token_hash,expires_at) values(created_order.id,encode(digest(receiver_token,'sha256'),'hex'),now()+interval '48 hours');
  end if;
  return jsonb_build_object('order_id',created_order.id,'order_reference',created_order.order_reference,'tracking_reference',created_order.tracking_reference,'payment_status',created_order.payment_status,'receiver_payment_token',receiver_token);
end;
$$;

create or replace function public.record_verified_payment(payment_intent_id uuid, provider_transaction_id text, event_payload jsonb) returns void
language plpgsql security definer set search_path=public as $$
declare selected_intent public.payment_intents%rowtype;
begin
  select * into selected_intent from public.payment_intents where id=$1 for update;
  if not found or selected_intent.status='paid' then return; end if;
  insert into public.payment_transactions(payment_intent_id,order_id,provider_transaction_id,amount_minor,currency,status,immutable_payload)
  values(selected_intent.id,selected_intent.order_id,$2,selected_intent.amount_minor,selected_intent.currency,'paid',$3) on conflict do nothing;
  update public.payment_intents set status='paid',updated_at=now() where id=selected_intent.id;
  update public.delivery_orders set payment_status='paid',updated_at=now() where id=selected_intent.order_id;
  update public.receiver_payment_tokens set consumed_at=now() where id=nullif($3#>>'{data,metadata,receiver_token_id}','')::uuid;
  insert into public.audit_logs(actor_type,action,resource_type,resource_id,metadata)
  values('system','payment.verified','delivery_order',selected_intent.order_id,jsonb_build_object('payment_intent_id',selected_intent.id));
end;
$$;

revoke all on function public.create_delivery_order(jsonb) from public,anon;
grant execute on function public.create_delivery_order(jsonb) to authenticated,service_role;
revoke all on function public.record_verified_payment(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.record_verified_payment(uuid,text,jsonb) to service_role;
revoke all on function public.transition_delivery_order(uuid,public.delivery_status,jsonb) from public,anon,authenticated;
grant execute on function public.transition_delivery_order(uuid,public.delivery_status,jsonb) to service_role;
