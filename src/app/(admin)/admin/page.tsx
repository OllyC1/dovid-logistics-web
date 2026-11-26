import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { LaunchReadinessPanel } from "@/components/admin/launch-readiness-panel";
import { assessDispatchReadiness } from "@/features/dispatch/readiness";
import { getStaffAuthorization } from "@/lib/auth/staff";
import { assistedBookingsEnabled, livePaymentsEnabled, publicBookingsEnabled } from "@/lib/launch-controls";
import { formatMoney } from "@/lib/utils";

export default async function AdminOverview() {
  const auth = await getStaffAuthorization();
  if (!auth || auth.staffRole === "rider") notFound();
  const title = auth.staffRole === "super_admin" ? "Super Admin Dashboard" : "Admin Dashboard";
  const canViewReports = auth.staffRole === "super_admin" || auth.permissions.includes("reports.view");
  if (!canViewReports) return <><p className="eyebrow">Dovid operations</p><h1 className="mt-2 text-3xl font-extrabold text-navy">{title}</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-slate">Use your authorized menu to manage the areas assigned to you. Financial and operational reports remain hidden unless the Super Admin grants that permission.</p></>;

  let launchReadiness: ReactNode = null;
  if (auth.staffRole === "super_admin") {
    const now = new Date().toISOString();
    const [{ data: vehicles }, { data: riderMemberships }, { data: riderProfiles }, { data: assignments }, { data: settings }, zones, rateCards] = await Promise.all([
      auth.admin.from("fleet_vehicles").select("id,registration_number,operational_status,safety_status,assigned_rider_id,max_active_assignments,capacity_verified_at"),
      auth.admin.from("staff_memberships").select("user_id").eq("staff_role", "rider").eq("status", "active"),
      auth.admin.from("profiles").select("id,full_name").eq("role", "rider"),
      auth.admin.from("delivery_assignments").select("vehicle_id,rider_id").is("released_at", null),
      auth.admin.from("service_area_operational_settings").select("max_active_assignments_per_rider,handover_buffer_minutes,safe_completion_buffer_minutes").limit(1).maybeSingle(),
      auth.admin.from("service_zones").select("id", { count: "exact", head: true }).eq("active", true).eq("operational_status", "active").not("approved_at", "is", null).not("boundary_geojson", "is", null),
      auth.admin.from("rate_cards").select("id", { count: "exact", head: true }).eq("active", true).eq("provisional", false).lte("effective_at", now).or(`expires_at.is.null,expires_at.gt.${now}`),
    ]);
    const activeMembershipIds = new Set((riderMemberships ?? []).map((membership) => membership.user_id));
    const activeNamedRiderIds = (riderProfiles ?? []).filter((profile) => activeMembershipIds.has(profile.id) && Boolean(profile.full_name?.trim())).map((profile) => profile.id);
    const dispatch = assessDispatchReadiness({
      vehicles: vehicles ?? [],
      activeNamedRiderIds,
      activeAssignments: assignments ?? [],
      riderParcelLimit: settings?.max_active_assignments_per_rider ?? 0,
      handoverBufferMinutes: settings?.handover_buffer_minutes ?? null,
      safeCompletionBufferMinutes: settings?.safe_completion_buffer_minutes ?? null,
    });
    launchReadiness = <LaunchReadinessPanel
      dispatch={dispatch}
      activeApprovedZones={zones.count ?? 0}
      activeRateCards={rateCards.count ?? 0}
      publicBookingsEnabled={publicBookingsEnabled()}
      livePaymentsEnabled={livePaymentsEnabled()}
      assistedBookingsEnabled={assistedBookingsEnabled()}
    />;
  }

  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const [{ data: orders }, { data: costs }] = await Promise.all([
    auth.supabase.from("delivery_orders").select("id,quoted_amount_minor,distance_meters,delivery_status,payment_status,created_at").gte("created_at", start.toISOString()),
    auth.supabase.from("quote_cost_estimates").select("estimated_operational_cost_kobo,estimated_profit_kobo,estimated_operating_margin_bps,quotes!inner(created_at)").gte("quotes.created_at", start.toISOString()),
  ]);
  const paid = (orders ?? []).filter((order) => order.payment_status === "paid");
  const revenue = paid.reduce((sum, order) => sum + order.quoted_amount_minor, 0);
  const estimatedCost = (costs ?? []).reduce((sum, item) => sum + item.estimated_operational_cost_kobo, 0);
  const estimatedProfit = (costs ?? []).reduce((sum, item) => sum + item.estimated_profit_kobo, 0);
  const distance = (orders ?? []).reduce((sum, order) => sum + order.distance_meters, 0);
  const belowTarget = (costs ?? []).filter((item) => item.estimated_operating_margin_bps < 2000).length;
  const cards = [
    ["Today's recognized revenue", formatMoney(revenue), "Actual paid orders"],
    ["Completed deliveries", String((orders ?? []).filter((order) => order.delivery_status === "delivered").length), "Actual status"],
    ["Average customer fare", formatMoney(paid.length ? Math.round(revenue / paid.length) : 0), "Actual paid orders"],
    ["Estimated delivery cost", formatMoney(estimatedCost), "Forecast estimate"],
    ["Estimated operating profit", formatMoney(estimatedProfit), "Forecast estimate"],
    ["Revenue per kilometre", formatMoney(distance ? Math.round(revenue / (distance / 1000)) : 0), "Actual revenue / routed km"],
    ["Orders below margin target", String(belowTarget), "Forecast alert"],
  ];
  return <><p className="eyebrow">Dovid operations</p><h1 className="mt-2 text-3xl font-extrabold text-navy">{title}</h1><p className="mt-3 text-sm text-slate">Actual, estimated and projected values are labelled separately.</p>{launchReadiness}<div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{cards.map(([label, value, note]) => <article key={label} className="rounded-3xl bg-white p-6 shadow-sm"><p className="text-sm text-slate">{label}</p><p className="mt-2 text-3xl font-extrabold text-navy">{value}</p><p className="mt-3 text-xs font-semibold text-orange">{note}</p></article>)}</div></>;
}
