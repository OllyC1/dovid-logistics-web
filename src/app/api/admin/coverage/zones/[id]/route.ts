import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { validateZoneGeoJson, zoneBoundariesOverlap, type ZoneGeoJson } from "@/features/service-areas/geometry";
import { getZonesManagerAuthorization as getAuthenticatedRole } from "@/lib/auth/staff";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const schema = z.object({
  name: z.string().trim().min(3).max(120),
  code: z.string().trim().min(1).max(12).transform((value) => value.toUpperCase()),
  boundaryGeoJson: z.unknown().nullable(),
  bookingEligibility: z.enum(["standard", "manual_approval", "unavailable"]),
  dispatchApprovalRequired: z.boolean(),
  priority: z.number().int().min(0).max(10_000),
  effectiveFrom: z.iso.datetime(),
  effectiveUntil: z.iso.datetime().nullable(),
  boundarySource: z.string().trim().max(500).nullable(),
  reviewNotes: z.string().trim().max(2_000).nullable()
});

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthenticatedRole();
  if (auth?.role !== "admin") return NextResponse.json({ error: "Admin authorization required" }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Please check the zone details.", issues: parsed.error.flatten() }, { status: 400 });
  if (parsed.data.effectiveUntil && new Date(parsed.data.effectiveUntil) <= new Date(parsed.data.effectiveFrom)) return NextResponse.json({ error: "The end date must be after the start date." }, { status: 400 });
  const geometryCheck = parsed.data.boundaryGeoJson === null ? { valid: true, issues: [] } : validateZoneGeoJson(parsed.data.boundaryGeoJson);
  if (!geometryCheck.valid) return NextResponse.json({ error: "The boundary is not valid.", issues: geometryCheck.issues }, { status: 400 });
  const { id } = await params;
  const admin = createSupabaseAdminClient();
  const { data: current } = await admin.from("service_zones").select("id,service_area_id,is_citywide").eq("id", id).maybeSingle();
  if (!current) return NextResponse.json({ error: "Zone not found" }, { status: 404 });
  const { data: otherZones } = await admin.from("service_zones").select("id,name,boundary_geojson,is_citywide").eq("service_area_id", current.service_area_id).neq("id", id).not("boundary_geojson", "is", null);
  const overlaps = parsed.data.boundaryGeoJson && !current.is_citywide ? (otherZones ?? []).filter((zone) => !zone.is_citywide && zone.boundary_geojson && zoneBoundariesOverlap(parsed.data.boundaryGeoJson as ZoneGeoJson, zone.boundary_geojson as ZoneGeoJson)).map((zone) => ({ id: zone.id, name: zone.name })) : [];
  const { data: saved, error } = await admin.from("service_zones").update({
    name: parsed.data.name,
    code: parsed.data.code,
    boundary_geojson: parsed.data.boundaryGeoJson,
    booking_eligibility: parsed.data.bookingEligibility,
    dispatch_approval_required: parsed.data.dispatchApprovalRequired,
    priority: parsed.data.priority,
    effective_from: parsed.data.effectiveFrom,
    effective_until: parsed.data.effectiveUntil,
    boundary_source: parsed.data.boundarySource,
    review_notes: parsed.data.reviewNotes
  }).eq("id", id).select("operational_status,active").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ saved: true, overlaps, operationalStatus: saved.operational_status, active: saved.active });
}
