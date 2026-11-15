import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getAuthenticatedRole } from "@/lib/auth/roles";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const schema = z.object({ idempotencyKey: z.uuid(), authorizationEvidence: z.object({ reason: z.string().min(8).max(1_000) }) });

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthenticatedRole();
  if (!auth || auth.role !== "customer") return NextResponse.json({ error: "Customer authorization required" }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Authorization evidence is required" }, { status: 400 });
  const { id } = await params;
  const admin = createSupabaseAdminClient();
  const { data: order } = await admin.from("delivery_orders").select("id,customer_id,payer,payment_status").eq("id", id).maybeSingle();
  if (!order || order.customer_id !== auth.user.id) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  if (order.payment_status === "paid") return NextResponse.json({ error: "The order is already settled" }, { status: 409 });
  if (order.payer === "sender") return NextResponse.json({ error: "The sender is already responsible for payment" }, { status: 409 });
  const { data, error } = await admin.from("payer_change_requests").insert({ order_id: id, requested_by: auth.user.id, previous_payer: order.payer, proposed_payer: "sender", authorization_evidence: { ...parsed.data.authorizationEvidence, authenticatedCustomerId: auth.user.id, requestedAt: new Date().toISOString() }, idempotency_key: parsed.data.idempotencyKey }).select("id,status").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 409 });
  return NextResponse.json(data, { status: 201 });
}

