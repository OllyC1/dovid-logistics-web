import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getDispatchManagerAuthorization as getAuthenticatedRole } from "@/lib/auth/staff";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const schema = z.object({ vehicleId: z.uuid(), riderId: z.uuid(), scheduledStartAt: z.iso.datetime().optional(), complianceReason: z.string().trim().min(8).max(1_000), idempotencyKey: z.uuid() });

export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedRole();
  if (auth?.role !== "admin") return NextResponse.json({ error: "Admin authorization required" }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Choose a rider, safe vehicle and record compliance confirmation." }, { status: 400 });
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("create_delivery_run", { target_vehicle_id: parsed.data.vehicleId, target_rider_id: parsed.data.riderId, actor_id: auth.user.id, target_start_at: parsed.data.scheduledStartAt ?? null, compliance_reason: parsed.data.complianceReason, request_idempotency_key: parsed.data.idempotencyKey });
  if (error) return NextResponse.json({ error: error.message }, { status: 409 });
  return NextResponse.json({ runId: data }, { status: 201 });
}

