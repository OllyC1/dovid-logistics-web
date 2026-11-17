-- Production-readiness hardening for the pre-launch database.
--
-- This migration is deliberately non-destructive:
--   * add covering indexes for the foreign keys reported by Supabase Advisor;
--   * make authenticated-only ownership policies explicit; and
--   * evaluate auth.uid() once per statement instead of once per row.
--
-- No table, column, constraint, policy, row, or permission is removed. The
-- policy predicates are otherwise unchanged.

-- Covering indexes for every foreign key reported by the 2026-11-17
-- unindexed_foreign_keys performance advisory.
create index if not exists idx_assisted_booking_drafts_accepted_by on public.assisted_booking_drafts (accepted_by);
create index if not exists idx_assisted_booking_drafts_created_by on public.assisted_booking_drafts (created_by);
create index if not exists idx_assisted_booking_drafts_customer_id on public.assisted_booking_drafts (customer_id);
create index if not exists idx_assisted_booking_drafts_order_id on public.assisted_booking_drafts (order_id);
create index if not exists idx_assisted_booking_drafts_quote_id on public.assisted_booking_drafts (quote_id);
create index if not exists idx_assisted_booking_events_actor_id on public.assisted_booking_events (actor_id);
create index if not exists idx_audit_logs_actor_id on public.audit_logs (actor_id);
create index if not exists idx_competitor_quotes_competitor_id on public.competitor_quotes (competitor_id);
create index if not exists idx_competitor_quotes_created_by on public.competitor_quotes (created_by);
create index if not exists idx_competitors_created_by on public.competitors (created_by);
create index if not exists idx_customer_addresses_customer_id on public.customer_addresses (customer_id);
create index if not exists idx_customer_surcharges_admin_approved_by on public.customer_surcharges (admin_approved_by);
create index if not exists idx_customer_surcharges_expense_report_id on public.customer_surcharges (expense_report_id);
create index if not exists idx_customer_surcharges_proposed_by on public.customer_surcharges (proposed_by);
create index if not exists idx_delivery_assignments_assigned_by on public.delivery_assignments (assigned_by);
create index if not exists idx_delivery_assignments_delivery_run_id on public.delivery_assignments (delivery_run_id);
create index if not exists idx_delivery_attempts_admin_decided_by on public.delivery_attempts (admin_decided_by);
create index if not exists idx_delivery_attempts_run_id on public.delivery_attempts (run_id);
create index if not exists idx_delivery_availability_requests_customer_id on public.delivery_availability_requests (customer_id);
create index if not exists idx_delivery_availability_requests_delivery_zone_id on public.delivery_availability_requests (delivery_zone_id);
create index if not exists idx_delivery_availability_requests_pickup_zone_id on public.delivery_availability_requests (pickup_zone_id);
create index if not exists idx_delivery_availability_requests_reviewed_by on public.delivery_availability_requests (reviewed_by);
create index if not exists idx_delivery_availability_requests_service_area_id on public.delivery_availability_requests (service_area_id);
create index if not exists idx_delivery_expense_reports_order_id on public.delivery_expense_reports (order_id);
create index if not exists idx_delivery_expense_reports_reviewed_by on public.delivery_expense_reports (reviewed_by);
create index if not exists idx_delivery_expense_reports_run_id on public.delivery_expense_reports (run_id);
create index if not exists idx_delivery_expenses_recorded_by on public.delivery_expenses (recorded_by);
create index if not exists idx_delivery_expenses_rider_id on public.delivery_expenses (rider_id);
create index if not exists idx_delivery_feedback_customer_id on public.delivery_feedback (customer_id);
create index if not exists idx_delivery_incidents_attempt_id on public.delivery_incidents (attempt_id);
create index if not exists idx_delivery_incidents_order_id on public.delivery_incidents (order_id);
create index if not exists idx_delivery_incidents_reported_by on public.delivery_incidents (reported_by);
create index if not exists idx_delivery_incidents_run_id on public.delivery_incidents (run_id);
create index if not exists idx_delivery_orders_assisted_booking_draft_id on public.delivery_orders (assisted_booking_draft_id);
create index if not exists idx_delivery_orders_availability_request_id on public.delivery_orders (availability_request_id);
create index if not exists idx_delivery_orders_pricing_configuration_version_id on public.delivery_orders (pricing_configuration_version_id);
create index if not exists idx_delivery_proofs_confirmed_by on public.delivery_proofs (confirmed_by);
create index if not exists idx_delivery_run_change_history_changed_by on public.delivery_run_change_history (changed_by);
create index if not exists idx_delivery_run_change_history_run_id on public.delivery_run_change_history (run_id);
create index if not exists idx_delivery_run_stops_order_id on public.delivery_run_stops (order_id);
create index if not exists idx_delivery_runs_compliance_confirmed_by on public.delivery_runs (compliance_confirmed_by);
create index if not exists idx_delivery_runs_created_by on public.delivery_runs (created_by);
create index if not exists idx_delivery_status_events_actor_id on public.delivery_status_events (actor_id);
create index if not exists idx_delivery_waiting_sessions_rider_id on public.delivery_waiting_sessions (rider_id);
create index if not exists idx_delivery_waiting_sessions_run_id on public.delivery_waiting_sessions (run_id);
create index if not exists idx_fleet_vehicles_assigned_rider_id on public.fleet_vehicles (assigned_rider_id);
create index if not exists idx_fleet_vehicles_capacity_verified_by on public.fleet_vehicles (capacity_verified_by);
create index if not exists idx_notifications_order_id on public.notifications (order_id);
create index if not exists idx_parcel_custody_events_recorded_by on public.parcel_custody_events (recorded_by);
create index if not exists idx_parcel_custody_events_rider_id on public.parcel_custody_events (rider_id);
create index if not exists idx_parcel_custody_events_run_id on public.parcel_custody_events (run_id);
create index if not exists idx_payer_change_requests_decided_by on public.payer_change_requests (decided_by);
create index if not exists idx_payer_change_requests_order_id on public.payer_change_requests (order_id);
create index if not exists idx_payer_change_requests_requested_by on public.payer_change_requests (requested_by);
create index if not exists idx_payment_reconciliations_reconciled_by on public.payment_reconciliations (reconciled_by);
create index if not exists idx_payment_transactions_order_id on public.payment_transactions (order_id);
create index if not exists idx_pricing_configuration_versions_created_by on public.pricing_configuration_versions (created_by);
create index if not exists idx_pricing_configuration_versions_updated_by on public.pricing_configuration_versions (updated_by);
create index if not exists idx_pricing_rules_service_area_id on public.pricing_rules (service_area_id);
create index if not exists idx_privileged_role_assignments_assigned_by on public.privileged_role_assignments (assigned_by);
create index if not exists idx_privileged_role_assignments_user_id on public.privileged_role_assignments (user_id);
create index if not exists idx_promotions_created_by on public.promotions (created_by);
create index if not exists idx_quotes_availability_request_id on public.quotes (availability_request_id);
create index if not exists idx_quotes_pricing_rule_id on public.quotes (pricing_rule_id);
create index if not exists idx_quotes_rate_card_id on public.quotes (rate_card_id);
create index if not exists idx_rate_cards_configuration_version_id on public.rate_cards (configuration_version_id);
create index if not exists idx_rate_cards_created_by on public.rate_cards (created_by);
create index if not exists idx_rate_cards_service_area_id on public.rate_cards (service_area_id);
create index if not exists idx_receiver_payment_tokens_order_id on public.receiver_payment_tokens (order_id);
create index if not exists idx_recurring_pickup_schedules_customer_id on public.recurring_pickup_schedules (customer_id);
create index if not exists idx_recurring_pickup_schedules_pickup_address_id on public.recurring_pickup_schedules (pickup_address_id);
create index if not exists idx_redelivery_requests_delivery_attempt_id on public.redelivery_requests (delivery_attempt_id);
create index if not exists idx_redelivery_requests_order_id on public.redelivery_requests (order_id);
create index if not exists idx_redelivery_requests_redelivery_quote_id on public.redelivery_requests (redelivery_quote_id);
create index if not exists idx_redelivery_requests_requested_by on public.redelivery_requests (requested_by);
create index if not exists idx_redelivery_requests_surcharge_id on public.redelivery_requests (surcharge_id);
create index if not exists idx_referrals_referrer_id on public.referrals (referrer_id);
create index if not exists idx_referrals_reward_promotion_id on public.referrals (reward_promotion_id);
create index if not exists idx_rider_compensation_plans_created_by on public.rider_compensation_plans (created_by);
create index if not exists idx_rider_monthly_bonuses_compensation_plan_id on public.rider_monthly_bonuses (compensation_plan_id);
create index if not exists idx_rider_monthly_bonuses_finalized_by on public.rider_monthly_bonuses (finalized_by);
create index if not exists idx_rider_monthly_bonuses_performance_record_id on public.rider_monthly_bonuses (performance_record_id);
create index if not exists idx_rider_performance_records_calculated_by on public.rider_performance_records (calculated_by);
create index if not exists idx_run_assignments_delivery_assignment_id on public.run_assignments (delivery_assignment_id);
create index if not exists idx_service_area_operational_settings_motorcycle_restrictions_confirmed_by on public.service_area_operational_settings (motorcycle_restrictions_confirmed_by);
create index if not exists idx_service_area_operational_settings_updated_by on public.service_area_operational_settings (updated_by);
create index if not exists idx_service_zone_change_history_changed_by on public.service_zone_change_history (changed_by);
create index if not exists idx_service_zones_approved_by on public.service_zones (approved_by);
create index if not exists idx_staff_audit_events_actor_id on public.staff_audit_events (actor_id);
create index if not exists idx_staff_audit_events_invitation_id on public.staff_audit_events (invitation_id);
create index if not exists idx_staff_audit_events_target_user_id on public.staff_audit_events (target_user_id);
create index if not exists idx_staff_invitations_auth_user_id on public.staff_invitations (auth_user_id);
create index if not exists idx_staff_invitations_invited_by on public.staff_invitations (invited_by);
create index if not exists idx_staff_memberships_identity_verified_by on public.staff_memberships (identity_verified_by);
create index if not exists idx_staff_memberships_suspended_by on public.staff_memberships (suspended_by);
create index if not exists idx_staff_permission_grants_granted_by on public.staff_permission_grants (granted_by);
create index if not exists idx_staff_permission_grants_permission_key on public.staff_permission_grants (permission_key);
create index if not exists idx_support_requests_customer_id on public.support_requests (customer_id);
create index if not exists idx_support_requests_order_id on public.support_requests (order_id);
create index if not exists idx_whatsapp_contact_opt_ins_recorded_by on public.whatsapp_contact_opt_ins (recorded_by);
create index if not exists idx_whatsapp_message_events_draft_id on public.whatsapp_message_events (draft_id);

-- These policies already required auth.uid(), so anonymous callers could never
-- satisfy them. Making the authenticated role explicit preserves that behaviour
-- and avoids evaluating auth.uid() for roles that cannot pass the predicate.
alter policy addresses_own on public.customer_addresses to authenticated
using ((customer_id = (select auth.uid())))
with check ((customer_id = (select auth.uid())));

alter policy customer_surcharges_read on public.customer_surcharges to authenticated
using ((exists (select 1 from public.delivery_orders o where o.id = customer_surcharges.order_id and o.customer_id = (select auth.uid()))));

alter policy rider_assignments_read on public.delivery_assignments to authenticated
using ((rider_id = (select auth.uid())));

alter policy rider_attempts_read on public.delivery_attempts to authenticated
using ((rider_id = (select auth.uid())));

alter policy customer_availability_requests_read on public.delivery_availability_requests to authenticated
using ((customer_id = (select auth.uid())));

alter policy rider_expenses_read on public.delivery_expense_reports to authenticated
using ((rider_id = (select auth.uid())));

alter policy rider_own_delivery_expenses on public.delivery_expenses to authenticated
using ((rider_id = (select auth.uid())));

alter policy customer_create_feedback on public.delivery_feedback to authenticated
with check ((customer_id = (select auth.uid())) and exists (
  select 1 from public.delivery_orders o
  where o.id = delivery_feedback.order_id
    and o.customer_id = (select auth.uid())
    and o.delivery_status = 'delivered'::public.delivery_status
));

alter policy customer_own_feedback on public.delivery_feedback to authenticated
using ((customer_id = (select auth.uid())));

alter policy rider_incidents_read on public.delivery_incidents to authenticated
using ((reported_by = (select auth.uid())));

alter policy orders_own_select on public.delivery_orders to authenticated
using ((customer_id = (select auth.uid())));

alter policy rider_assigned_orders_select on public.delivery_orders to authenticated
using ((rider_id = (select auth.uid())) and public.has_role('rider'::public.app_role));

alter policy packages_own_select on public.delivery_packages to authenticated
using ((exists (select 1 from public.delivery_orders o where o.id = delivery_packages.order_id and o.customer_id = (select auth.uid()))));

alter policy rider_assigned_packages_select on public.delivery_packages to authenticated
using ((exists (select 1 from public.delivery_orders o where o.id = delivery_packages.order_id and o.rider_id = (select auth.uid()))));

alter policy proofs_own_select on public.delivery_proofs to authenticated
using ((exists (select 1 from public.delivery_orders o where o.id = delivery_proofs.order_id and o.customer_id = (select auth.uid()))));

alter policy rider_delivery_run_stops_read on public.delivery_run_stops to authenticated
using ((exists (select 1 from public.delivery_runs r where r.id = delivery_run_stops.run_id and r.rider_id = (select auth.uid()))));

alter policy rider_delivery_runs_read on public.delivery_runs to authenticated
using ((rider_id = (select auth.uid())));

alter policy events_own_select on public.delivery_status_events to authenticated
using ((exists (select 1 from public.delivery_orders o where o.id = delivery_status_events.order_id and o.customer_id = (select auth.uid()))));

alter policy rider_assigned_status_events_select on public.delivery_status_events to authenticated
using ((exists (select 1 from public.delivery_orders o where o.id = delivery_status_events.order_id and o.rider_id = (select auth.uid()))));

alter policy rider_waiting_read on public.delivery_waiting_sessions to authenticated
using ((rider_id = (select auth.uid())));

alter policy rider_assigned_vehicle_read on public.fleet_vehicles to authenticated
using ((assigned_rider_id = (select auth.uid())));

alter policy notifications_own on public.notifications to authenticated
using ((customer_id = (select auth.uid())));

alter policy rider_custody_read on public.parcel_custody_events to authenticated
using ((rider_id = (select auth.uid())));

alter policy customer_payer_changes_read on public.payer_change_requests to authenticated
using ((exists (select 1 from public.delivery_orders o where o.id = payer_change_requests.order_id and o.customer_id = (select auth.uid()))));

alter policy intents_own_select on public.payment_intents to authenticated
using ((exists (select 1 from public.delivery_orders o where o.id = payment_intents.order_id and o.customer_id = (select auth.uid()))));

alter policy transactions_own_select on public.payment_transactions to authenticated
using ((exists (select 1 from public.delivery_orders o where o.id = payment_transactions.order_id and o.customer_id = (select auth.uid()))));

alter policy quotes_own_select on public.quotes to authenticated
using ((customer_id = (select auth.uid())));

alter policy customer_own_recurring_pickups on public.recurring_pickup_schedules to authenticated
using ((customer_id = (select auth.uid())))
with check ((customer_id = (select auth.uid())));

alter policy customer_redelivery_read on public.redelivery_requests to authenticated
using ((exists (select 1 from public.delivery_orders o where o.id = redelivery_requests.order_id and o.customer_id = (select auth.uid()))));

alter policy customer_create_referral on public.referrals to authenticated
with check ((referrer_id = (select auth.uid())) and referred_customer_id is null and status = 'issued');

alter policy customer_own_referrals on public.referrals to authenticated
using ((referrer_id = (select auth.uid())) or (referred_customer_id = (select auth.uid())));

alter policy rider_own_monthly_bonuses on public.rider_monthly_bonuses to authenticated
using ((rider_id = (select auth.uid())));

alter policy rider_own_performance_records on public.rider_performance_records to authenticated
using ((rider_id = (select auth.uid())));

alter policy rider_run_assignments_read on public.run_assignments to authenticated
using ((exists (select 1 from public.delivery_runs r where r.id = run_assignments.run_id and r.rider_id = (select auth.uid()))));

alter policy support_own_select on public.support_requests to authenticated
using ((customer_id = (select auth.uid())));
