import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { evaluateAttemptResolution } from "@/features/operations/delivery-attempts";
import { getAuthenticatedRole } from "@/lib/auth/roles";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const schema = z.object({ resolution: z.enum(["retry_immediately","schedule_redelivery","correct_address","return_to_sender","authorized_hold","open_incident","cancel"]), attributableTo: z.enum(["customer","dovid","under_review"]), reason: z.string().trim().min(8).max(1_000), scheduledAt: z.iso.datetime().optional(), correctedAddress: z.string().min(8).max(300).optional(), correctedLatitude: z.number().optional(), correctedLongitude: z.number().optional(), idempotencyKey: z.uuid() });

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthenticatedRole();
  if (auth?.role !== "admin") return NextResponse.json({ error: "Admin authorization required" }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Complete the exception resolution.", issues: parsed.error.flatten() }, { status: 400 });
  const { id } = await params;
  const admin = createSupabaseAdminClient();
  const { data: attempt } = await admin.from("delivery_attempts").select("id,order_id,run_id,rider_id,status,admin_decision,delivery_orders(customer_id,delivery_status)").eq("id", id).maybeSingle();
  if (!attempt) return NextResponse.json({ error: "Delivery attempt not found" }, { status: 404 });
  if (attempt.admin_decision) return NextResponse.json({ error: "This attempt already has a resolution" }, { status: 409 });
  const order = Array.isArray(attempt.delivery_orders) ? attempt.delivery_orders[0] : attempt.delivery_orders;
  const resolution = evaluateAttemptResolution({ reason: attempt.status as Parameters<typeof evaluateAttemptResolution>[0]["reason"], resolution: parsed.data.resolution, attributableTo: parsed.data.attributableTo });
  if (resolution.requiresCorrectedAddress && !parsed.data.correctedAddress) return NextResponse.json({ error: "A reviewed corrected address is required" }, { status: 400 });
  const now = new Date().toISOString();
  const { error: updateError } = await admin.from("delivery_attempts").update({ admin_decision: parsed.data.resolution, admin_decided_by: auth.user.id, admin_decided_at: now, customer_notification_status: "queued" }).eq("id", id).is("admin_decision", null);
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 409 });
  let redeliveryRequestId: string | null = null;
  if (["schedule_redelivery","correct_address"].includes(parsed.data.resolution)) {
    const { data: redelivery, error } = await admin.from("redelivery_requests").insert({ order_id: attempt.order_id, delivery_attempt_id: attempt.id, requested_by: auth.user.id, requested_by_role: "admin", status: parsed.data.attributableTo === "customer" ? "requested" : parsed.data.scheduledAt ? "scheduled" : "requested", corrected_address: parsed.data.correctedAddress ?? null, corrected_latitude: parsed.data.correctedLatitude ?? null, corrected_longitude: parsed.data.correctedLongitude ?? null, scheduled_at: parsed.data.scheduledAt ?? null, charge_attribution: parsed.data.attributableTo, decision_reason: parsed.data.reason, idempotency_key: parsed.data.idempotencyKey }).select("id").single();
    if (error) return NextResponse.json({ error: "Attempt was reviewed, but redelivery creation needs manual follow-up." }, { status: 500 });
    redeliveryRequestId = redelivery.id;
  }
  if (parsed.data.resolution === "return_to_sender") {
    await admin.from("run_assignments").update({ status: "returning" }).eq("order_id", attempt.order_id);
    await admin.from("parcel_custody_events").insert({ order_id: attempt.order_id, run_id: attempt.run_id, rider_id: attempt.rider_id, event_type: "return_started", evidence: { attemptId: attempt.id, resolutionReason: parsed.data.reason }, recorded_by: auth.user.id, idempotency_key: parsed.data.idempotencyKey });
  }
  let incidentId: string | null = null;
  if (resolution.requiresIncident) {
    const { data: incident } = await admin.from("delivery_incidents").insert({ order_id: attempt.order_id, run_id: attempt.run_id, attempt_id: attempt.id, reported_by: auth.user.id, incident_type: attempt.status === "unsafe_delivery" ? "safety" : "other", severity: attempt.status === "unsafe_delivery" ? "high" : "medium", description: parsed.data.reason, evidence: {}, idempotency_key: parsed.data.idempotencyKey }).select("id").single();
    incidentId = incident?.id ?? null;
  }
  if (order?.customer_id) await admin.from("notifications").upsert({ customer_id: order.customer_id, order_id: attempt.order_id, channel: "in_app", event_type: "delivery_attempt_resolved", title: "Delivery update", body: parsed.data.resolution === "return_to_sender" ? "Your parcel is being returned to the sender. Check the order page for updates." : "Dispatch has reviewed the delivery attempt. Check your order for the next step.", deduplication_key: `attempt-resolution:${attempt.id}`, status: "queued" }, { onConflict: "deduplication_key", ignoreDuplicates: true });
  return NextResponse.json({ resolution: parsed.data.resolution, redeliveryRequestId, incidentId, customerChargeCreated: false, customerApprovalRequired: resolution.mayProposeCustomerCharge });
}

