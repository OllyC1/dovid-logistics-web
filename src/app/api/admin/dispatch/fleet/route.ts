import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getDispatchManagerAuthorization } from "@/lib/auth/staff";

const schema = z.object({
  registrationNumber: z.string().trim().min(3).max(20).regex(/^[a-zA-Z0-9 -]+$/),
  internalCode: z.string().trim().min(2).max(30).regex(/^[a-zA-Z0-9 -]+$/).optional(),
  manufacturer: z.string().trim().min(2).max(60),
  model: z.string().trim().min(1).max(60),
  modelYear: z.number().int().min(1980).max(2100).nullable(),
  homeTerritoryCodes: z.array(z.enum(["A", "B", "C", "D", "E", "F"])).max(6),
  reason: z.string().trim().min(8).max(1_000),
});

function normalizeIdentifier(value: string) {
  return value.trim().replace(/\s+/g, " ").toUpperCase();
}

export async function POST(request: NextRequest) {
  const auth = await getDispatchManagerAuthorization();
  if (!auth) return NextResponse.json({ error: "Dispatch manager authorization required." }, { status: 403 });

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter the plate number, bike details and a clear registration reason." }, { status: 400 });
  }

  const registrationNumber = normalizeIdentifier(parsed.data.registrationNumber);
  const code = normalizeIdentifier(parsed.data.internalCode || registrationNumber).replaceAll(" ", "-");
  const { data: vehicle, error } = await auth.admin.from("fleet_vehicles").insert({
    registration_number: registrationNumber,
    code,
    manufacturer: parsed.data.manufacturer,
    model: parsed.data.model,
    model_year: parsed.data.modelYear,
    home_territory_codes: parsed.data.homeTerritoryCodes,
    operational_status: "offline",
    safety_status: "review_required",
    assigned_rider_id: null,
    max_active_assignments: 1,
    created_by: auth.user.id,
  }).select("id,code,registration_number").single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "That plate number or internal bike name is already registered." }, { status: 409 });
    }
    return NextResponse.json({ error: "The bike could not be registered. Check the details and try again." }, { status: 400 });
  }

  const { error: auditError } = await auth.admin.from("audit_logs").insert({
    actor_id: auth.user.id,
    actor_type: "admin",
    action: "fleet.vehicle.created",
    resource_type: "fleet_vehicle",
    resource_id: vehicle.id,
    metadata: {
      registrationNumber: vehicle.registration_number,
      code: vehicle.code,
      manufacturer: parsed.data.manufacturer,
      model: parsed.data.model,
      modelYear: parsed.data.modelYear,
      homeTerritoryCodes: parsed.data.homeTerritoryCodes,
      reason: parsed.data.reason,
      initialOperationalStatus: "offline",
      initialSafetyStatus: "review_required",
    },
  });

  if (auditError) {
    await auth.admin.from("fleet_vehicles").delete().eq("id", vehicle.id);
    return NextResponse.json({ error: "The bike registration was not recorded because its audit entry failed." }, { status: 500 });
  }

  return NextResponse.json({ created: true, vehicle: { id: vehicle.id, code: vehicle.code, registrationNumber: vehicle.registration_number } }, { status: 201 });
}
