-- Legacy staff policies were created without a TO clause, which makes them
-- apply to PostgreSQL PUBLIC. Anonymous reads then attempted to execute the
-- private staff-permission helpers and produced avoidable permission errors.
-- Keep every authorization predicate unchanged and scope only the staff
-- policy branch to signed-in users.

alter policy admin_competitor_quotes on public.competitor_quotes to authenticated;
alter policy admin_competitors on public.competitors to authenticated;
alter policy admin_delivery_expenses on public.delivery_expenses to authenticated;
alter policy admin_delivery_feedback on public.delivery_feedback to authenticated;
alter policy admin_orders_select on public.delivery_orders to authenticated;
alter policy admin_packages_select on public.delivery_packages to authenticated;
alter policy admin_status_events_select on public.delivery_status_events to authenticated;
alter policy admin_payment_reconciliations on public.payment_reconciliations to authenticated;
alter policy admin_pricing_versions on public.pricing_configuration_versions to authenticated;
alter policy admin_pricing_configurations on public.pricing_configurations to authenticated;
alter policy admin_promotions on public.promotions to authenticated;
alter policy admin_quote_cost_estimates on public.quote_cost_estimates to authenticated;
alter policy admin_quotes_select on public.quotes to authenticated;
alter policy admin_rate_card_bands on public.rate_card_bands to authenticated;
alter policy admin_rate_cards on public.rate_cards to authenticated;
alter policy admin_recurring_pickups on public.recurring_pickup_schedules to authenticated;
alter policy admin_referrals on public.referrals to authenticated;
alter policy admin_compensation_plans on public.rider_compensation_plans to authenticated;
alter policy admin_monthly_bonuses on public.rider_monthly_bonuses to authenticated;
alter policy admin_performance_records on public.rider_performance_records to authenticated;
