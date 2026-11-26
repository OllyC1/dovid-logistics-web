\set ON_ERROR_STOP on

begin;

do $$
declare
  scoped_count integer;
begin
  if exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and roles = '{public}'
      and (
        coalesce(qual, '') ~* '(current_staff|has_staff_permission|has_role)'
        or coalesce(with_check, '') ~* '(current_staff|has_staff_permission|has_role)'
      )
  ) then
    raise exception 'a trusted-role RLS policy still applies to PUBLIC';
  end if;

  select count(*) into scoped_count
  from pg_policies
  where schemaname = 'public'
    and roles = '{authenticated}'
    and policyname in (
      'admin_competitor_quotes',
      'admin_competitors',
      'admin_delivery_expenses',
      'admin_delivery_feedback',
      'admin_orders_select',
      'admin_packages_select',
      'admin_status_events_select',
      'admin_payment_reconciliations',
      'admin_pricing_versions',
      'admin_pricing_configurations',
      'admin_promotions',
      'admin_quote_cost_estimates',
      'admin_quotes_select',
      'admin_rate_card_bands',
      'admin_rate_cards',
      'admin_recurring_pickups',
      'admin_referrals',
      'admin_compensation_plans',
      'admin_monthly_bonuses',
      'admin_performance_records'
    );
  if scoped_count <> 20 then
    raise exception 'expected 20 authenticated staff policies, found %', scoped_count;
  end if;
end
$$;

-- Anonymous Data API reads must fail closed as empty results, not by trying to
-- execute a private staff helper that anon is deliberately unable to call.
set local role anon;
select count(*) from public.delivery_orders;
select count(*) from public.quotes;
select count(*) from public.delivery_packages;
reset role;

rollback;

select 'staff policy role scoping validation passed' as result;
