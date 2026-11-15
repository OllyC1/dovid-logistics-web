import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getAuthenticatedRole } from "@/lib/auth/roles";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const schema = z.object({ action: z.enum(["approve","reject","dispute"]), reason: z.string().trim().max(1_000).optional(), idempotencyKey: z.uuid() });

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthenticatedRole();
  if (!auth || auth.role !== "customer") return NextResponse.json({ error: "Customer authorization required" }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Choose how to respond to this charge." }, { status: 400 });
  const { id } = await params;
  const admin = createSupabaseAdminClient();
  const { data: surcharge } = await admin.from("customer_surcharges").select("id,order_id,status,proposed_amount_kobo,delivery_orders!inner(customer_id)").eq("id", id).maybeSingle();
  const order = Array.isArray(surcharge?.delivery_orders) ? surcharge.delivery_orders[0] : surcharge?.delivery_orders;
  if (!surcharge || order?.customer_id !== auth.user.id) return NextResponse.json({ error: "Charge proposal not found" }, { status: 404 });
  if (surcharge.status !== "proposed") return NextResponse.json({ error: "This charge proposal has already been answered." }, { status: 409 });
  const status = parsed.data.action === "approve" ? "customer_approved" : parsed.data.action === "reject" ? "rejected" : "disputed";
  const update = status === "customer_approved" ? { status, approved_amount_kobo: surcharge.proposed_amount_kobo, customer_approved_at: new Date().toISOString(), customer_authorization: { idempotencyKey: parsed.data.idempotencyKey, source: "authenticated_customer", acceptedAt: new Date().toISOString() } } : { status, dispute_reason: parsed.data.reason ?? parsed.data.action };
  const { error } = await admin.from("customer_surcharges").update(update).eq("id", id).eq("status", "proposed");
  if (error) return NextResponse.json({ error: error.message }, { status: 409 });
  return NextResponse.json({ status, paymentRequired: status === "customer_approved" });
}

