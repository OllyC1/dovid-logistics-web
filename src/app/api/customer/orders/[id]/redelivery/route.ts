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
  const admin = createSupabaseAdminClient();
  const { data: order } = await admin.from("delivery_orders").select("id,customer_id").eq("id", id).maybeSingle();
  if (!order || order.customer_id !== auth.user.id) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  const { data: attempt } = await admin.from("delivery_attempts").select("id").eq("id", parsed.data.deliveryAttemptId).eq("order_id", id).maybeSingle();
  if (!attempt) return NextResponse.json({ error: "Delivery attempt not found" }, { status: 404 });
  const { data, error } = await admin.from("redelivery_requests").insert({ order_id: id, delivery_attempt_id: attempt.id, requested_by: auth.user.id, requested_by_role: "customer", status: "requested", corrected_address: parsed.data.correctedAddress ?? null, corrected_latitude: parsed.data.correctedLatitude ?? null, corrected_longitude: parsed.data.correctedLongitude ?? null, scheduled_at: parsed.data.scheduledAt ?? null, charge_attribution: "under_review", idempotency_key: parsed.data.idempotencyKey }).select("id,status").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 409 });
  return NextResponse.json({ ...data, customerCharged: false }, { status: 201 });
}

