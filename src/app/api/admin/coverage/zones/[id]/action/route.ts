import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { validateZoneGeoJson, zoneBoundariesOverlap, type ZoneGeoJson } from "@/features/service-areas/geometry";
import { getZonesManagerAuthorization as getAuthenticatedRole } from "@/lib/auth/staff";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const schema = z.object({ action: z.enum(["review", "approve", "activate", "publish", "suspend"]), reason: z.string().trim().min(8).max(1_000) });

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthenticatedRole();
  if (auth?.role !== "admin") return NextResponse.json({ error: "Admin authorization required" }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Choose an action and provide a clear reason." }, { status: 400 });
  const { id } = await params;
  const admin = createSupabaseAdminClient();
  if (parsed.data.action === "publish" && auth.staffRole !== "super_admin") {
    return NextResponse.json({ error: "Only the Super Admin can save and publish a zone in one step." }, { status: 403 });
  }
  const { data: zone } = await admin.from("service_zones").select("id,service_area_id,boundary_geojson,is_citywide").eq("id", id).maybeSingle();
  if (!zone) return NextResponse.json({ error: "Zone not found" }, { status: 404 });
  if (parsed.data.action !== "suspend") {
    const validation = validateZoneGeoJson(zone.boundary_geojson);
    if (!validation.valid) return NextResponse.json({ error: "Fix the boundary before continuing.", issues: validation.issues }, { status: 409 });
    const { data: others } = await admin.from("service_zones").select("id,name,boundary_geojson,is_citywide").eq("service_area_id", zone.service_area_id).neq("id", id).not("boundary_geojson", "is", null).neq("operational_status", "draft");
    const overlaps = zone.is_citywide ? [] : (others ?? []).filter((candidate) => !candidate.is_citywide && candidate.boundary_geojson && zoneBoundariesOverlap(zone.boundary_geojson as ZoneGeoJson, candidate.boundary_geojson as ZoneGeoJson));
    if (overlaps.length) return NextResponse.json({ error: `Resolve the overlap with ${overlaps.map((candidate) => candidate.name).join(", ")} before continuing.` }, { status: 409 });
  }
  const { error } = await admin.rpc("manage_service_zone_action", {
    target_zone_id: id,
    actor_id: auth.user.id,
    requested_action: parsed.data.action,
    reason: parsed.data.reason
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 409 });
  return NextResponse.json({ action: parsed.data.action, completed: true });
}
