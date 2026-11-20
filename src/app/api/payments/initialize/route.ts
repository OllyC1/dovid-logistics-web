import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getOrInitializePaymentCheckout, paymentCheckoutErrorStatus } from "@/features/payments/checkout";
import { getOrCreateMainPaymentIntent } from "@/features/payments/intents";
import { publicEnv } from "@/lib/env";
import { initializePaystackPayment } from "@/lib/paystack/client";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const schema = z.object({ orderId: z.uuid(), idempotencyKey: z.uuid() });

export async function POST(request: NextRequest) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid order" }, { status: 400 });
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const customerEmail = user.email;
  const { data: order } = await supabase.from("delivery_orders").select("id,order_reference,quoted_amount_minor,currency,payment_status,payment_method,payer,delivery_status").eq("id", parsed.data.orderId).maybeSingle();
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  if (["cancelled", "delivered"].includes(order.delivery_status)) return NextResponse.json({ error: "This delivery can no longer accept payment" }, { status: 409 });
  if (order.payer !== "sender") return NextResponse.json({ error: "This delivery is assigned to receiver payment" }, { status: 409 });
  if (order.currency !== "NGN") return NextResponse.json({ error: "Unsupported currency" }, { status: 400 });
  if (order.payment_status === "paid") return NextResponse.json({ error: "Order is already paid" }, { status: 409 });

  const admin = createSupabaseAdminClient();
  try {
    if (order.quoted_amount_minor === 0) {
      const { error } = await admin.rpc("settle_complimentary_payment", { target_order_id: order.id });
      if (error) throw error;
      return NextResponse.json({ checkoutUrl: `/account/orders/${order.id}`, confirmed: true }, { headers: { "Cache-Control": "no-store" } });
    }
    const intent = await getOrCreateMainPaymentIntent(admin, { orderId: order.id, orderReference: order.order_reference, amountMinor: order.quoted_amount_minor, currency: order.currency, idempotencyKey: parsed.data.idempotencyKey, receiver: false });
    const checkout = await getOrInitializePaymentCheckout(admin, intent, () => initializePaystackPayment({ email: customerEmail, amountMinor: order.quoted_amount_minor, reference: intent.provider_reference, callbackUrl: `${publicEnv.NEXT_PUBLIC_APP_URL}/pay/callback`, metadata: { order_id: order.id, payment_intent_id: intent.id, payment_type: "sender" }, channels: order.payment_method === "bank_transfer" ? ["bank_transfer"] : undefined }));
    await admin.from("delivery_orders").update({ payment_status: "processing", updated_at: new Date().toISOString() }).eq("id", order.id).neq("payment_status", "paid");
    return NextResponse.json({ checkoutUrl: checkout.authorization_url });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Payment unavailable" }, { status: paymentCheckoutErrorStatus(error) });
  }
}
