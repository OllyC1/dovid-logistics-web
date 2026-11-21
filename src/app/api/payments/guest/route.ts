import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { hashAssistedSecret } from "@/features/assisted-bookings/security";
import { getOrInitializePaymentCheckout, paymentCheckoutErrorStatus } from "@/features/payments/checkout";
import { getOrCreateMainPaymentIntent } from "@/features/payments/intents";
import { publicEnv } from "@/lib/env";
import { initializePaystackPayment } from "@/lib/paystack/client";
import { takeRateLimit } from "@/lib/server/rate-limit";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const schema = z.object({
  token: z.string().min(40).max(128),
  email: z.email(),
  idempotencyKey: z.uuid(),
});

export async function POST(request: NextRequest) {
  const rateLimit = takeRateLimit(request, "guest-sender-payment", 10, 10 * 60_000);
  if (rateLimit.limited) return NextResponse.json({ error: "Too many payment attempts. Please wait a few minutes." }, { status: 429 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid receipt email and try again." }, { status: 400 });

  const admin = createSupabaseAdminClient();
  const { data: access } = await admin.from("guest_order_access_tokens")
    .select("id,order_id,expires_at,revoked_at")
    .eq("token_hash", hashAssistedSecret(parsed.data.token))
    .maybeSingle();
  if (!access || access.revoked_at || new Date(access.expires_at) <= new Date()) {
    return NextResponse.json({ error: "This secure delivery link is invalid or has expired." }, { status: 410 });
  }

  const { data: order } = await admin.from("delivery_orders")
    .select("id,order_reference,quoted_amount_minor,currency,payment_status,payment_method,payer,delivery_status,customer_id,assisted_booking_draft_id,guest_booking")
    .eq("id", access.order_id)
    .maybeSingle();
  if (!order || order.customer_id || (!order.assisted_booking_draft_id && !order.guest_booking)) return NextResponse.json({ error: "Guest delivery not found." }, { status: 404 });
  if (["cancelled", "delivered"].includes(order.delivery_status)) return NextResponse.json({ error: "This delivery can no longer accept payment." }, { status: 409 });
  if (order.payer !== "sender") return NextResponse.json({ error: "The receiver is paying for this delivery." }, { status: 409 });
  if (order.payment_status === "paid") return NextResponse.json({ error: "This delivery is already paid." }, { status: 409 });
  if (order.currency !== "NGN") return NextResponse.json({ error: "This currency is not supported." }, { status: 400 });

  try {
    if (order.quoted_amount_minor === 0) {
      await admin.from("delivery_orders").update({ receipt_email: parsed.data.email.toLowerCase(), updated_at: new Date().toISOString() }).eq("id", order.id);
      const { error } = await admin.rpc("settle_complimentary_payment", { target_order_id: order.id });
      if (error) throw error;
      return NextResponse.json({ checkoutUrl: null, confirmed: true }, { headers: { "Cache-Control": "no-store" } });
    }
    const intent = await getOrCreateMainPaymentIntent(admin, {
      orderId: order.id,
      orderReference: order.order_reference,
      amountMinor: order.quoted_amount_minor,
      currency: order.currency,
      idempotencyKey: parsed.data.idempotencyKey,
      receiver: false,
    });
    const checkout = await getOrInitializePaymentCheckout(admin, intent, () => initializePaystackPayment({
      email: parsed.data.email,
      amountMinor: order.quoted_amount_minor,
      reference: intent.provider_reference,
      callbackUrl: `${publicEnv.NEXT_PUBLIC_APP_URL}/pay/callback?returnTo=${encodeURIComponent(`/guest/orders/${parsed.data.token}`)}`,
      metadata: { order_id: order.id, payment_intent_id: intent.id, payment_type: "guest_sender" },
      channels: order.payment_method === "bank_transfer" ? ["bank_transfer"] : undefined,
    }));
    const now = new Date().toISOString();
    await Promise.all([
      admin.from("delivery_orders").update({ receipt_email: parsed.data.email.toLowerCase(), payment_status: "processing", updated_at: now }).eq("id", order.id).neq("payment_status", "paid"),
      admin.from("guest_order_access_tokens").update({ last_used_at: now }).eq("id", access.id),
    ]);
    return NextResponse.json({ checkoutUrl: checkout.authorization_url }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Payment is unavailable right now." }, { status: paymentCheckoutErrorStatus(error) });
  }
}
