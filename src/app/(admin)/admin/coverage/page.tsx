import { CoverageEditor, type CoverageZone, type OperationalSettings } from "@/components/admin/coverage-editor";
import { requireStaffPermission } from "@/lib/auth/staff";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type ZoneHistoryRow = {
  id: string;
  action: string;
  change_reason: string | null;
  created_at: string;
  service_zones: Array<{ name: string }>;
};

export default async function CoveragePage() {
  await requireStaffPermission("zones.manage");
  const admin = createSupabaseAdminClient();
  const [{ data: zones }, { data: settings }, { data: orders }, { data: history }] = await Promise.all([
    admin.from("service_zones").select("id,name,code,boundary_geojson,operational_status,booking_eligibility,dispatch_approval_required,priority,effective_from,effective_until,boundary_source,review_notes").order("priority"),
    admin.from("service_area_operational_settings").select("*").eq("service_area_id", "10000000-0000-4000-8000-000000000001").single(),
    admin.from("delivery_orders").select("pickup_zone_id,delivery_zone_id"),
    admin.from("service_zone_change_history").select("id,zone_id,action,change_reason,created_at,service_zones(name)").order("created_at", { ascending: false }).limit(20),
  ]);

  if (!settings) return <p>Ibadan operational settings are unavailable.</p>;

  const zonesWithCounts = (zones ?? []).map((zone) => ({
    ...zone,
    affectedOrders: (orders ?? []).filter((order) => order.pickup_zone_id === zone.id || order.delivery_zone_id === zone.id).length,
  }));
  const historyRows = (history ?? []) as ZoneHistoryRow[];

  return (
    <>
      <p className="eyebrow">Coverage Operations</p>
      <h1 className="mt-2 text-3xl font-extrabold text-navy">Ibadan service zones</h1>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-slate">Planning labels are not boundaries. Draw or import reviewed geographic polygons, resolve validation issues, then complete review and approval before activation.</p>
      <div className="mt-8">
        <CoverageEditor initialZones={zonesWithCounts as CoverageZone[]} settings={settings as OperationalSettings} mapsKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY} />
      </div>
      <section className="mt-8 rounded-3xl bg-white p-6">
        <h2 className="text-xl font-extrabold text-navy">Recent zone history</h2>
        <div className="mt-4 grid gap-3">
          {historyRows.map((item) => (
            <div key={item.id} className="rounded-2xl bg-cloud p-4 text-sm">
              <p className="font-bold text-navy">{item.service_zones[0]?.name} · {item.action}</p>
              <p className="mt-1 text-slate">{new Date(item.created_at).toLocaleString("en-GB")} {item.change_reason ? `· ${item.change_reason}` : ""}</p>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
