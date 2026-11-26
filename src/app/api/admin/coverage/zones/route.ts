import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getZonesManagerAuthorization } from "@/lib/auth/staff";

const schema = z.object({
  serviceAreaId: z.uuid(),
  name: z.string().trim().min(3).max(120),
  code: z.string().trim().min(1).max(12).regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/),
  bookingEligibility: z.enum(["standard", "manual_approval", "unavailable"]),
  dispatchApprovalRequired: z.boolean(),
  priority: z.number().int().min(0).max(10_000),
  effectiveFrom: z.iso.datetime(),
  effectiveUntil: z.iso.datetime().nullable(),
  boundarySource: z.string().trim().max(500).nullable(),
  reviewNotes: z.string().trim().max(2_000).nullable(),
  reason: z.string().trim().min(8).max(1_000)
});

export async function POST(request: NextRequest) {
  const auth = await getZonesManagerAuthorization();
  if (auth?.role !== "admin") return NextResponse.json({ error: "Admin authorization required" }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Please check the new zone details.", issues: parsed.error.flatten() }, { status: 400 });
  if (parsed.data.effectiveUntil && new Date(parsed.data.effectiveUntil) <= new Date(parsed.data.effectiveFrom)) {
    return NextResponse.json({ error: "The end date must be after the start date." }, { status: 400 });
  }

  const { data: zoneId, error } = await auth.admin.rpc("create_service_zone_draft", {
    target_service_area_id: parsed.data.serviceAreaId,
    actor_id: auth.user.id,
    zone_name: parsed.data.name,
    zone_code: parsed.data.code,
    zone_booking_eligibility: parsed.data.bookingEligibility,
    zone_dispatch_approval_required: parsed.data.dispatchApprovalRequired,
    zone_priority: parsed.data.priority,
    zone_effective_from: parsed.data.effectiveFrom,
    zone_effective_until: parsed.data.effectiveUntil,
    zone_boundary_source: parsed.data.boundarySource,
    zone_review_notes: parsed.data.reviewNotes,
    creation_reason: parsed.data.reason
  });
  if (error) {
    const duplicateCode = error.code === "23505";
    return NextResponse.json({ error: duplicateCode ? "That zone code is already in use. Choose another stable code." : error.message }, { status: duplicateCode ? 409 : 400 });
  }

  const { data: zone, error: zoneError } = await auth.admin.from("service_zones")
    .select("id,name,code,boundary_geojson,operational_status,booking_eligibility,dispatch_approval_required,priority,effective_from,effective_until,boundary_source,review_notes,is_citywide,active")
    .eq("id", zoneId)
    .single();
  if (zoneError || !zone) return NextResponse.json({ error: "The zone was created, but its draft could not be loaded." }, { status: 503 });
  return NextResponse.json({ zone: { ...zone, affectedOrders: 0 } }, { status: 201 });
}
