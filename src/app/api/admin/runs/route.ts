import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { hasVerifiedVehicleRegistration } from "@/features/fleet/registration";
import { getDispatchManagerAuthorization as getAuthenticatedRole } from "@/lib/auth/staff";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const schema = z.object({ vehicleId: z.uuid(), riderId: z.uuid(), scheduledStartAt: z.iso.datetime().optional(), complianceReason: z.string().trim().min(8).max(1_000), idempotencyKey: z.uuid() });

export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedRole();
  if (!auth) return NextResponse.json({ error: "Dispatch manager authorization required." }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Choose a rider, safe vehicle and record compliance confirmation." }, { status: 400 });
  const admin = createSupabaseAdminClient();
  const [{ data: vehicle }, { data: riderMembership }] = await Promise.all([
    admin.from("fleet_vehicles").select("id,registration_number,registration_verified_at,manufacturer,model,model_year,operational_status,safety_status,assigned_rider_id,capacity_verified_at").eq("id", parsed.data.vehicleId).maybeSingle(),
    admin.from("staff_memberships").select("user_id").eq("user_id", parsed.data.riderId).eq("staff_role", "rider").eq("status", "active").maybeSingle(),
  ]);
  if (!vehicle || !hasVerifiedVehicleRegistration(vehicle) || vehicle.capacity_verified_at === null || vehicle.operational_status !== "available" || vehicle.safety_status !== "cleared") return NextResponse.json({ error: "Choose an available bike with an evidence-verified plate, verified safety and measured capacity." }, { status: 409 });
  if (!riderMembership || vehicle.assigned_rider_id !== parsed.data.riderId) return NextResponse.json({ error: "Choose the active rider assigned to this bike." }, { status: 409 });
  const { data, error } = await admin.rpc("create_delivery_run", { target_vehicle_id: parsed.data.vehicleId, target_rider_id: parsed.data.riderId, actor_id: auth.user.id, target_start_at: parsed.data.scheduledStartAt ?? null, compliance_reason: parsed.data.complianceReason, request_idempotency_key: parsed.data.idempotencyKey });
  if (error) return NextResponse.json({ error: error.message }, { status: 409 });
  return NextResponse.json({ runId: data }, { status: 201 });
}

