import { createHash } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getOrCreateMainPaymentIntent, markPaymentInitializationFailed } from "@/features/payments/intents";
import { publicEnv } from "@/lib/env";
import { initializePaystackPayment } from "@/lib/paystack/client";
import { takeRateLimit } from "@/lib/server/rate-limit";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const schema = z.object({ token: z.string().min(64).max(128), email: z.email() });

export async function POST(request: NextRequest) {
  const rateLimit = takeRateLimit(request, "receiver-payment", 10);
  if (rateLimit.limited) return NextResponse.json({ error: "Too many payment attempts. Please wait a moment." }, { status: 429 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payment request" }, { status: 400 });
  const admin = createSupabaseAdminClient();
  const tokenHash = createHash("sha256").update(parsed.data.token).digest("hex");
  const { data: paymentToken } = await admin.from("receiver_payment_tokens").select("id,order_id,expires_at,consumed_at").eq("token_hash", tokenHash).maybeSingle();
  if (!paymentToken || paymentToken.consumed_at || new Date(paymentToken.expires_at) <= new Date()) return NextResponse.json({ error: "Payment link is invalid or expired" }, { status: 410 });
  const { data: order } = await admin.from("delivery_orders").select("id,order_reference,quoted_amount_minor,currency,payment_status,payment_method,payer").eq("id", paymentToken.order_id).single();
  if (!order || order.payer === "sender") return NextResponse.json({ error: "This payment link is not valid for the delivery" }, { status: 409 });
  if (order.payment_status === "paid") return NextResponse.json({ error: "This order does not require payment" }, { status: 409 });
  if (order.currency !== "NGN") return NextResponse.json({ error: "Unsupported currency" }, { status: 400 });

  let intent: Awaited<ReturnType<typeof getOrCreateMainPaymentIntent>> | null = null;
  try {
    intent = await getOrCreateMainPaymentIntent(admin, { orderId: order.id, orderReference: order.order_reference, amountMinor: order.quoted_amount_minor, currency: order.currency, receiver: true });
    const checkout = await initializePaystackPayment({ email: parsed.data.email, amountMinor: order.quoted_amount_minor, reference: intent.provider_reference, callbackUrl: `${publicEnv.NEXT_PUBLIC_APP_URL}/pay/callback`, metadata: { order_id: order.id, payment_intent_id: intent.id, receiver_token_id: paymentToken.id, payment_type: "receiver" }, channels: order.payment_method === "bank_transfer" ? ["bank_transfer"] : undefined });
    await admin.from("delivery_orders").update({ payment_status: "processing", updated_at: new Date().toISOString() }).eq("id", order.id).neq("payment_status", "paid");
    return NextResponse.json({ checkoutUrl: checkout.authorization_url });
  } catch (error) {
    if (intent) await markPaymentInitializationFailed(admin, intent.id);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Payment unavailable" }, { status: 503 });
  }
}
