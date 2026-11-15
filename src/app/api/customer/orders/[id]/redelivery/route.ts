import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getAuthenticatedRole } from "@/lib/auth/roles";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const schema = z.object({ deliveryAttemptId: z.uuid(), correctedAddress: z.string().min(8).max(300).optional(), correctedLatitude: z.number().optional(), correctedLongitude: z.number().optional(), scheduledAt: z.iso.datetime().optional(), idempotencyKey: z.uuid() });

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthenticatedRole();
  if (!auth || auth.role !== "customer") return NextResponse.json({ error: "Customer authorization required" }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Complete the redelivery request." }, { status: 400 });
  const { id } = await params;
  const { data, error } = await createSupabaseAdminClient().rpc("request_order_redelivery", { target_order_id: id, target_attempt_id: parsed.data.deliveryAttemptId, actor_id: auth.user.id, corrected_address: parsed.data.correctedAddress ?? null, corrected_latitude: parsed.data.correctedLatitude ?? null, corrected_longitude: parsed.data.correctedLongitude ?? null, requested_schedule: parsed.data.scheduledAt ?? null, request_idempotency_key: parsed.data.idempotencyKey });
  if (error) return NextResponse.json({ error: error.message }, { status: 409 });
  return NextResponse.json({ ...(data as { id: string; status: string }), customerCharged: false }, { status: 201 });
}

