import { DispatchConsole } from "@/components/admin/dispatch-console";
import { requireStaffPermission } from "@/lib/auth/staff";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export default async function DispatchPage() {
  await requireStaffPermission("dispatch.manage");
  const admin = createSupabaseAdminClient();
  const [{ data: vehicles }, { data: riderMemberships }, { data: riderProfiles }, { data: requests }, { data: orders }] = await Promise.all([
    admin.from("fleet_vehicles").select("id,code,registration_number,manufacturer,model,model_year,operational_status,safety_status,assigned_rider_id,home_territory_codes,max_active_assignments,max_payload_weight_grams,cargo_length_mm,cargo_width_mm,cargo_height_mm,capacity_verified_at").order("code"),
    admin.from("staff_memberships").select("user_id").eq("staff_role", "rider").eq("status", "active"),
    admin.from("profiles").select("id,full_name").eq("role", "rider").order("full_name"),
    admin.from("delivery_availability_requests").select("id,reference_code,decision,reason_code,road_distance_meters,created_at,request_payload").eq("status", "pending").order("created_at"),
    admin.from("delivery_orders").select("id,order_reference,pickup_address,delivery_address,pickup_zone_id").eq("delivery_status", "awaiting_assignment").order("created_at")
  ]);
  const activeRiderIds = new Set((riderMemberships ?? []).map((membership) => membership.user_id));
  const activeRiderProfiles = (riderProfiles ?? []).filter((profile) => activeRiderIds.has(profile.id));
  const riders = activeRiderProfiles.filter((profile) => Boolean(profile.full_name?.trim()));
  const missingRiderNames = activeRiderProfiles.length - riders.length;
  return <><p className="eyebrow">Dispatch Control</p><h1 className="mt-2 text-3xl font-extrabold text-navy">Fleet and dispatch</h1><p className="mt-3 max-w-3xl text-sm leading-6 text-slate">Register motorcycles, verify safety and capacity, assign active riders, then make bikes available. Home territories guide dispatch but never permanently restrict a rider.</p><div className="mt-8"><DispatchConsole vehicles={vehicles ?? []} riders={riders} missingRiderNames={missingRiderNames} requests={(requests ?? []) as never} orders={orders ?? []}/></div></>;
}
