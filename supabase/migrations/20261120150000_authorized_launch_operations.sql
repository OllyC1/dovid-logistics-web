alter table public.promotions
  add column if not exists auto_apply boolean not null default false,
  add column if not exists allow_below_profitability_floor boolean not null default false,
  add column if not exists floor_override_reason text;

alter table public.promotions
  drop constraint if exists promotions_floor_override_reason_check,
  add constraint promotions_floor_override_reason_check check (
    (allow_below_profitability_floor and floor_override_reason is not null and length(trim(floor_override_reason)) >= 8)
    or (not allow_below_profitability_floor and floor_override_reason is null)
  );

create unique index if not exists one_active_auto_applied_promotion_idx
  on public.promotions ((1)) where active and auto_apply;

alter table public.payment_intents
  drop constraint if exists payment_intents_amount_minor_check,
  add constraint payment_intents_amount_minor_check check (amount_minor >= 0);

create or replace function public.settle_complimentary_payment(target_order_id uuid)
returns uuid
language plpgsql security definer set search_path=public as $$
declare selected_order public.delivery_orders%rowtype;
declare selected_intent_id uuid;
declare payment_reference text;
begin
  select * into selected_order from public.delivery_orders where id=target_order_id for update;
  if not found then raise exception 'order not found'; end if;
  if selected_order.quoted_amount_minor <> 0 then raise exception 'complimentary settlement requires a zero-price order'; end if;
  if selected_order.payment_status = 'paid' then
    select id into selected_intent_id from public.payment_intents
    where order_id=target_order_id and surcharge_id is null and amount_minor=0 and status='paid'
    order by created_at limit 1;
    if selected_intent_id is not null then return selected_intent_id; end if;
    raise exception 'paid zero-price order has no complimentary payment evidence';
  end if;
  payment_reference := selected_order.order_reference || '-COMP-' || substr(replace(gen_random_uuid()::text,'-',''),1,10);
  insert into public.payment_intents(
    order_id,provider,provider_reference,amount_minor,currency,status,last_provider_status,
    last_verified_at,expires_at
  ) values (
    selected_order.id,'complimentary',payment_reference,0,selected_order.currency,'paid',
    'approved_complimentary_promotion',now(),null
  ) returning id into selected_intent_id;
  insert into public.payment_transactions(
    payment_intent_id,order_id,provider_transaction_id,amount_minor,currency,status,immutable_payload
  ) values (
    selected_intent_id,selected_order.id,payment_reference,0,selected_order.currency,'paid',
    jsonb_build_object('provider','complimentary','reason','Super Admin approved 100% promotion')
  );
  update public.delivery_orders set payment_status='paid',updated_at=now() where id=selected_order.id;
  insert into public.audit_logs(actor_type,action,resource_type,resource_id,metadata)
  values ('system','payment.complimentary_settled','delivery_order',selected_order.id,
    jsonb_build_object('payment_intent_id',selected_intent_id,'amount_minor',0,'currency',selected_order.currency));
  return selected_intent_id;
end;
$$;

revoke all on function public.settle_complimentary_payment(uuid) from public,anon,authenticated;
grant execute on function public.settle_complimentary_payment(uuid) to service_role;

update public.service_area_operational_settings
set service_hours = '{"timezone":"Africa/Lagos","monday":["08:00","22:00"],"tuesday":["08:00","22:00"],"wednesday":["08:00","22:00"],"thursday":["08:00","22:00"],"friday":["08:00","22:00"],"saturday":["08:00","22:00"],"sunday":["08:00","22:00"]}'::jsonb,
    same_day_booking_cutoff = '20:00',
    waiting_free_minutes = 10,
    waiting_fee_per_minute_kobo = 5000,
    motorcycle_restrictions_confirmed_at = now(),
    motorcycle_restrictions_notes = 'Founder approved standard dispatch-motorcycle operation for Zones A-E. Zone F remains subject to explicit dispatch approval.',
    updated_at = now()
where service_area_id = '10000000-0000-4000-8000-000000000001';

update public.fleet_vehicles
set registration_number = case id
      when '20000000-0000-4000-8000-000000000001' then 'PENDING-BIKE-01'
      when '20000000-0000-4000-8000-000000000002' then 'PENDING-BIKE-02'
      else registration_number
    end,
    max_active_assignments = 1,
    max_payload_weight_grams = 25000,
    cargo_length_mm = 470,
    cargo_width_mm = 410,
    cargo_height_mm = 390,
    capacity_verified_at = now(),
    updated_at = now()
where id in (
  '20000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000002'
);

do $$
declare
  current_version public.pricing_configuration_versions%rowtype;
  next_version_id uuid := gen_random_uuid();
  next_rate_card_id uuid := gen_random_uuid();
  current_rate_card public.rate_cards%rowtype;
begin
  select * into current_version from public.pricing_configuration_versions
  where status='active'
  order by effective_at desc limit 1 for update;
  if not found then raise exception 'active pricing configuration not found'; end if;
  select * into current_rate_card from public.rate_cards
  where configuration_version_id=current_version.id and active=true and service_level='standard'
  order by effective_at desc limit 1;
  if not found then raise exception 'active standard rate card not found'; end if;

  update public.pricing_configuration_versions
  set status='retired',retired_at=now(),updated_at=now()
  where id=current_version.id;
  insert into public.pricing_configuration_versions(
    id,pricing_configuration_id,version,assumptions,status,effective_at,change_reason
  ) values (
    next_version_id,current_version.pricing_configuration_id,current_version.version + 1,
    jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(
            current_version.assumptions,
            '{freeWaitingMinutes}','10'::jsonb
          ),
          '{waitingBlockMinutes}','1'::jsonb
        ),
        '{waitingFeePerBlockKobo}','5000'::jsonb
      ),
      '{targetOperatingMarginBps}','0'::jsonb
    ),
    'active',now(),
    'Founder approved 8am-10pm launch operations, NGN 50/min waiting after 10 minutes, and break-even minimum profitability for normal fares.'
  );

  update public.rate_cards set active=false where id=current_rate_card.id;
  insert into public.rate_cards(
    id,configuration_version_id,service_area_id,name,service_level,provisional,active,effective_at
  ) values (
    next_rate_card_id,next_version_id,current_rate_card.service_area_id,
    'Ibadan approved standard rate card','standard',false,true,now()
  );
  insert into public.rate_card_bands(
    rate_card_id,position,minimum_distance_meters,maximum_distance_meters,price_kobo,additional_per_kilometer_kobo
  )
  select next_rate_card_id,position,minimum_distance_meters,maximum_distance_meters,price_kobo,additional_per_kilometer_kobo
  from public.rate_card_bands where rate_card_id=current_rate_card.id order by position;

  insert into public.audit_logs(actor_type,action,resource_type,resource_id,metadata)
  values (
    'admin','pricing.launch_configuration.activated','pricing_configuration_version',next_version_id,
    jsonb_build_object(
      'approvedBy','Dovid Logistics',
      'rateCardId',next_rate_card_id,
      'serviceHours','08:00-22:00 Africa/Lagos',
      'lastPickup','20:00',
      'waiting','NGN 50 per minute after 10 minutes',
      'normalProfitabilityTargetBps',0
    )
  );
end;
$$;

insert into public.promotions(
  code,kind,value,maximum_discount_kobo,stackable,auto_apply,
  allow_below_profitability_floor,floor_override_reason,active,starts_at,ends_at,eligibility
) values (
  'DOVID1500','fixed_price',150000,null,false,true,true,
  'Founder approved the first-week fixed NGN 1,500 launch price below the normal profitability floor.',
  true,now(),now() + interval '7 days','{}'::jsonb
),(
  'DOVIDFREE','percentage',10000,null,false,false,true,
  'Super Admin may deliberately approve a 100% complimentary-order campaign using this separate code.',
  false,now(),null,'{}'::jsonb
)
on conflict(code) do nothing;

insert into public.audit_logs(actor_type,action,resource_type,metadata)
select 'admin','promotion.launch_configuration.approved','promotion',
  jsonb_build_object(
    'code',code,
    'active',active,
    'autoApply',auto_apply,
    'allowBelowProfitabilityFloor',allow_below_profitability_floor,
    'approvedBy','Dovid Logistics'
  )
from public.promotions where code in ('DOVID1500','DOVIDFREE');
