import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getPricingManagerAuthorization as getAuthenticatedRole } from "@/lib/auth/staff";
import { getRouteDistance } from "@/lib/maps/routes";

const coordinatesSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

const schema = z.object({
  competitorId: z.uuid(),
  serviceAreaId: z.uuid(),
  pickupAddress: z.string().trim().min(5).max(300),
  pickupCoordinates: coordinatesSchema,
  dropoffAddress: z.string().trim().min(5).max(300),
  dropoffCoordinates: coordinatesSchema,
  packageCategory: z.string().trim().min(2).max(80),
  serviceLevel: z.enum(["standard", "express", "scheduled"]),
  quotedTotalKobo: z.number().int().positive(),
  taxIncluded: z.boolean().nullable(),
  surchargesKobo: z.number().int().nonnegative().default(0),
  quotedAt: z.iso.datetime(),
  expiresAt: z.iso.datetime().nullable().optional(),
  evidenceUrl: z.url().optional(),
  verificationMethod: z.string().trim().min(3).max(200),
  verificationStatus: z.enum(["unverified", "verified", "stale", "rejected"]),
  comparable: z.boolean(),
  notes: z.string().trim().max(1_000).optional(),
});

export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedRole();
  if (auth?.role !== "admin") {
    return NextResponse.json({ error: "Admin authorization required" }, { status: 403 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Please check the quote details and try again.", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const input = parsed.data;
  let route: Awaited<ReturnType<typeof getRouteDistance>>;
  try {
    route = await getRouteDistance(input.pickupCoordinates, input.dropoffCoordinates);
  } catch {
    return NextResponse.json(
      { error: "We could not measure this road route right now. Please try again; no evidence was saved." },
      { status: 503 },
    );
  }

  const routeEvidence = `Route checked: ${input.pickupAddress} to ${input.dropoffAddress}.`;
  const notes = input.notes ? `${routeEvidence}\n${input.notes}` : routeEvidence;
  const { data, error } = await auth.supabase
    .from("competitor_quotes")
    .insert({
      competitor_id: input.competitorId,
      service_area_id: input.serviceAreaId,
      pickup_latitude: input.pickupCoordinates.latitude,
      pickup_longitude: input.pickupCoordinates.longitude,
      dropoff_latitude: input.dropoffCoordinates.latitude,
      dropoff_longitude: input.dropoffCoordinates.longitude,
      road_distance_meters: route.distanceMeters,
      package_category: input.packageCategory,
      service_level: input.serviceLevel,
      quoted_total_kobo: input.quotedTotalKobo,
      tax_included: input.taxIncluded,
      surcharges_kobo: input.surchargesKobo,
      quoted_at: input.quotedAt,
      expires_at: input.expiresAt,
      evidence_url: input.evidenceUrl,
      verification_method: input.verificationMethod,
      verification_status: input.verificationStatus,
      comparable: input.comparable,
      notes,
      created_by: auth.user.id,
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json(
      { error: "We could not save this competitor quote. Please review the details and try again." },
      { status: 400 },
    );
  }

  return NextResponse.json(
    { id: data.id, roadDistanceMeters: route.distanceMeters, duration: route.duration },
    { status: 201 },
  );
}
