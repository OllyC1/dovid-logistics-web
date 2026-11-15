import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { canTransition } from "@/features/orders/state-machine";
import { getAuthenticatedRole } from "@/lib/auth/roles";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { DeliveryStatus } from "@/types/domain";

const schema = z.object({ orderId: z.uuid(), runId: z.uuid().nullable().optional(), status: z.enum(["attempted","recipient_unavailable","address_problem","recipient_refused","payment_refused","access_blocked","unsafe_delivery","rescheduled","returned_to_sender","incident_escalated"]), contactAttempts: z.array(z.object({ method: z.enum(["call","sms","whatsapp","intercom","other"]), outcome: z.string().max(200), at: z.iso.datetime() })).max(20), waitingDurationSeconds: z.number().int().nonnegative(), failureReason: z.string().trim().min(3).max(1_000), evidence: z.record(z.string(), z.unknown()).default({}), location: z.object({ latitude: z.number(), longitude: z.number() }).optional(), riderNotes: z.string().max(2_000).optional(), idempotencyKey: z.uuid() });

export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedRole();
  if (!auth || !["rider","admin"].includes(auth.role)) return NextResponse.json({ error: "Rider authorization required" }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Complete the delivery-attempt report.", issues: parsed.error.flatten() }, { status: 400 });
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("record_delivery_attempt", { target_order_id: parsed.data.orderId, target_run_id: parsed.data.runId ?? null, actor_id: auth.user.id, attempt_status: parsed.data.status, contact_attempts_payload: parsed.data.contactAttempts, waiting_seconds: parsed.data.waitingDurationSeconds, failure_reason_text: parsed.data.failureReason, evidence_payload: parsed.data.evidence, location_payload: parsed.data.location ?? null, rider_notes_text: parsed.data.riderNotes ?? null, request_idempotency_key: parsed.data.idempotencyKey });
  if (error) return NextResponse.json({ error: error.message }, { status: 409 });
  const { data: order } = await admin.from("delivery_orders").select("delivery_status").eq("id", parsed.data.orderId).maybeSingle();
  const currentStatus = order?.delivery_status as DeliveryStatus | undefined;
  if (currentStatus && canTransition(currentStatus, "delivery_failed")) {
    const { error: transitionError } = await admin.rpc("transition_delivery_order", { order_id: parsed.data.orderId, new_status: "delivery_failed", metadata: { source: "delivery_attempt", attemptId: data, actorUserId: auth.user.id, actorRole: auth.role } });
    if (transitionError) return NextResponse.json({ error: transitionError.message }, { status: 409 });
  }
  return NextResponse.json({ attemptId: data, nextStep: "Dispatch will review retry, redelivery, return or incident options." }, { status: 201 });
}

