import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { hashAssistedSecret } from "@/features/assisted-bookings/security";
import { bookingSchema } from "@/features/orders/validation";
import { getAuthenticatedRole } from "@/lib/auth/roles";
import { assistedBookingsEnabled } from "@/lib/launch-controls";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const schema = z.object({
  payer: z.enum(["sender", "receiver_before_delivery", "receiver_at_delivery"]),
  termsAccepted: z.literal(true),
  termsVersion: z.string().min(1).max(50),
  idempotencyKey: z.uuid(),
});

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  if (!assistedBookingsEnabled()) return NextResponse.json({ error: "Assisted order confirmation is not open yet." }, { status: 503 });
  const auth = await getAuthenticatedRole();
  if (!auth || auth.role !== "customer") return NextResponse.json({ error: "Sign in as the customer to accept this quote." }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Confirm the payer and accept the terms." }, { status: 400 });
  const { token } = await params;
  const verificationSession = (await cookies()).get("dovid_assisted_verification")?.value;
  if (!verificationSession) return NextResponse.json({ error: "Verify the contact code again." }, { status: 403 });
  const admin = createSupabaseAdminClient();
  const tokenHash = hashAssistedSecret(token);
  const { data: accepted, error: acceptanceError } = await admin.rpc("accept_assisted_quote", {
    access_token_hash: tokenHash,
    verification_session_hash: hashAssistedSecret(verificationSession),
    actor_customer_id: auth.user.id,
    selected_payer: parsed.data.payer,
    acceptance_idempotency: parsed.data.idempotencyKey,
    acceptance_evidence: { termsAccepted: true, termsVersion: parsed.data.termsVersion, acceptedAt: new Date().toISOString(), source: "secure_assisted_quote" },
  });
  if (acceptanceError) return NextResponse.json({ error: acceptanceError.message }, { status: 409 });
  const result = accepted as { draftId: string; quoteId: string; requestPayload: Record<string, unknown> };
  const booking = bookingSchema.safeParse({ ...result.requestPayload, quoteId: result.quoteId, idempotencyKey: parsed.data.idempotencyKey, payer: parsed.data.payer });
  if (!booking.success) return NextResponse.json({ error: "The accepted quote is missing required order details.", issues: booking.error.flatten() }, { status: 409 });
  const { data: order, error: orderError } = await auth.supabase.rpc("create_delivery_order", { booking_payload: booking.data });
  if (orderError) return NextResponse.json({ error: orderError.message }, { status: 409 });
  const created = order as { order_id: string; order_reference: string; tracking_reference: string; payment_status: string; receiver_payment_token?: string | null };
  const { error: completionError } = await admin.rpc("complete_assisted_booking", { target_draft_id: result.draftId, target_order_id: created.order_id, access_token_hash: tokenHash });
  if (completionError) return NextResponse.json({ error: "Order was created, but assisted-booking completion needs administrator review.", order: created }, { status: 500 });
  return NextResponse.json({ order: created, paymentRequired: created.payment_status !== "paid" }, { status: 201 });
}

