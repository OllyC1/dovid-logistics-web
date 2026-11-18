import { RunOperationsConsole } from "@/components/admin/run-operations-console";
import type { AttemptForReview } from "@/components/admin/attempt-resolution-card";
import { requireStaffPermission } from "@/lib/auth/staff";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export default async function RunOperationsPage() {
  await requireStaffPermission("dispatch.manage");
  const admin = createSupabaseAdminClient();
  const [{ data: vehicles }, { data: riderMemberships }, { data: riderProfiles }, { data: runs }, { data: orders }, { data: expenses }, { data: attempts }] = await Promise.all([
    admin.from("fleet_vehicles").select("id,code,registration_number,operational_status,assigned_rider_id,safety_status").order("code"),
    admin.from("staff_memberships").select("user_id").eq("staff_role", "rider").eq("status", "active"),
    admin.from("profiles").select("id,full_name").eq("role", "rider").order("full_name"),
    admin.from("delivery_runs").select("id,run_reference,status,rider_id,vehicle_id,route_distance_meters,route_duration_seconds,expected_completion_at,total_revenue_kobo,estimated_profit_kobo,run_assignments(id,status),delivery_run_stops(id,stop_type,sequence,status,address)").in("status", ["planned","active","paused"]).order("created_at", { ascending: false }),
    admin.from("delivery_orders").select("id,order_reference,pickup_address,delivery_address").eq("delivery_status", "awaiting_assignment").order("created_at"),
    admin.from("delivery_expense_reports").select("id,category,amount_kobo,description,status,order_id").in("status", ["reported","under_review","disputed"]).order("created_at"),
    admin.from("delivery_attempts").select("id,order_id,attempt_number,status,failure_reason,created_at,delivery_orders!delivery_attempts_order_id_fkey(order_reference,pickup_address,delivery_address,recipient_name,recipient_phone)").is("admin_decision", null).order("created_at", { ascending: false }),
  ]);
  const activeRiderIds = new Set((riderMemberships ?? []).map((membership) => membership.user_id));
  const riders = (riderProfiles ?? []).filter((profile) => activeRiderIds.has(profile.id) && Boolean(profile.full_name?.trim()));
  const attemptRows = (attempts ?? []).map((attempt) => ({ ...attempt, delivery_orders: Array.isArray(attempt.delivery_orders) ? attempt.delivery_orders[0] ?? null : attempt.delivery_orders })) as AttemptForReview[];
  return <><p className="eyebrow">Run operations</p><h1 className="mt-2 text-3xl font-extrabold text-navy">Multi-parcel dispatch control</h1><p className="mt-3 max-w-3xl text-sm leading-6 text-slate">Plan one rider run with distinct customer orders. Every added parcel is rechecked against provider routing, verified motorcycle capacity, deadlines and safety controls.</p><div className="mt-8"><RunOperationsConsole vehicles={vehicles ?? []} riders={riders} runs={(runs ?? []) as never} orders={orders ?? []} expenses={expenses ?? []} attempts={attemptRows}/></div></>;
}

