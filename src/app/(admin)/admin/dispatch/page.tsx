import { DispatchConsole } from "@/components/admin/dispatch-console";
import { requireStaffPermission } from "@/lib/auth/staff";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export default async function DispatchPage() {
  await requireStaffPermission("dispatch.manage");
  const admin = createSupabaseAdminClient();
  const [{ data: vehicles }, { data: riders }, { data: requests }, { data: orders }] = await Promise.all([
    admin.from("fleet_vehicles").select("id,code,operational_status,safety_status,assigned_rider_id,home_territory_codes,max_active_assignments,max_payload_weight_grams,cargo_length_mm,cargo_width_mm,cargo_height_mm,capacity_verified_at").order("code"),
    admin.from("profiles").select("id,full_name").eq("role", "rider").order("full_name"),
    admin.from("delivery_availability_requests").select("id,decision,reason_code,road_distance_meters,created_at,request_payload").eq("status", "pending").order("created_at"),
    admin.from("delivery_orders").select("id,order_reference,pickup_address,delivery_address,pickup_zone_id").eq("delivery_status", "awaiting_assignment").order("created_at")
  ]);
  return <><p className="eyebrow">Dispatch Control</p><h1 className="mt-2 text-3xl font-extrabold text-navy">Two-bike operations</h1><p className="mt-3 max-w-3xl text-sm leading-6 text-slate">Assignments check bike safety, rider workload and capacity. Home territories improve ranking but never permanently restrict either rider.</p><div className="mt-8"><DispatchConsole vehicles={vehicles ?? []} riders={riders ?? []} requests={(requests ?? []) as never} orders={orders ?? []}/></div></>;
}
