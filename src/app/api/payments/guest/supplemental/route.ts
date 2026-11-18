import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { hashAssistedSecret } from "@/features/assisted-bookings/security";
import { PAYMENT_INTENT_TTL_MS, isPaymentIntentExpired, markPaymentInitializationFailed } from "@/features/payments/intents";
import { publicEnv } from "@/lib/env";
import { initializePaystackPayment } from "@/lib/paystack/client";
import { takeRateLimit } from "@/lib/server/rate-limit";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const schema = z.object({
  token: z.string().min(40).max(128),
  surchargeId: z.uuid(),
  email: z.email(),
  idempotencyKey: z.uuid(),
});

const supportedCategories = new Set([
  "waiting_time", "toll_road_access", "redelivery", "authorized_parking_access",
  "extra_stop", "address_correction", "return_journey", "other",
]);

export async function POST(request: NextRequest) {
  const rateLimit = takeRateLimit(request, "guest-supplemental-payment", 10, 10 * 60_000);
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
  const { data: surcharge } = await admin.from("customer_surcharges")
    .select("id,order_id,status,approved_amount_kobo,category,delivery_orders!inner(order_reference,currency,delivery_status,customer_id,assisted_booking_draft_id,guest_booking)")
    .eq("id", parsed.data.surchargeId)
    .eq("order_id", access.order_id)
    .maybeSingle();
  const order = Array.isArray(surcharge?.delivery_orders) ? surcharge.delivery_orders[0] : surcharge?.delivery_orders;
  if (!surcharge || !order || order.customer_id || (!order.assisted_booking_draft_id && !order.guest_booking)) {
    return NextResponse.json({ error: "Additional charge not found." }, { status: 404 });
  }
  if (["cancelled", "delivered"].includes(order.delivery_status)) return NextResponse.json({ error: "This delivery can no longer accept payment." }, { status: 409 });
  if (surcharge.status === "paid") return NextResponse.json({ error: "This charge is already paid." }, { status: 409 });
  if (surcharge.status !== "customer_approved" || !surcharge.approved_amount_kobo) {
    return NextResponse.json({ error: "Approve this charge before paying it." }, { status: 409 });
  }
  if (!supportedCategories.has(surcharge.category)) return NextResponse.json({ error: "This charge needs staff review." }, { status: 409 });

  let { data: intent } = await admin.from("payment_intents")
    .select("id,provider_reference,status,expires_at")
    .eq("surcharge_id", surcharge.id)
    .in("status", ["pending", "processing", "paid"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (intent?.status === "paid") return NextResponse.json({ error: "This charge is already paid." }, { status: 409 });
  if (intent && isPaymentIntentExpired(intent.expires_at)) {
    await admin.from("payment_intents").update({ status: "expired", last_provider_status: "locally_expired", updated_at: new Date().toISOString() }).eq("id", intent.id);
    intent = null;
  }
  if (!intent) {
    const reference = `${order.order_reference}-EXTRA-${crypto.randomUUID().slice(0, 8)}`;
    const { data, error } = await admin.from("payment_intents").insert({
      order_id: surcharge.order_id,
      surcharge_id: surcharge.id,
      provider: "paystack",
      provider_reference: reference,
      amount_minor: surcharge.approved_amount_kobo,
      currency: order.currency,
      status: "processing",
      expires_at: new Date(Date.now() + PAYMENT_INTENT_TTL_MS).toISOString(),
      idempotency_key: parsed.data.idempotencyKey,
      last_provider_status: "initialized",
    }).select("id,provider_reference,status,expires_at").single();
    if (error) return NextResponse.json({ error: "A payment for this charge is already in progress." }, { status: 409 });
    intent = data;
  }
  try {
    const checkout = await initializePaystackPayment({
      email: parsed.data.email,
      amountMinor: surcharge.approved_amount_kobo,
      reference: intent.provider_reference,
      callbackUrl: `${publicEnv.NEXT_PUBLIC_APP_URL}/pay/callback?returnTo=${encodeURIComponent(`/guest/orders/${parsed.data.token}`)}`,
      metadata: { order_id: surcharge.order_id, payment_intent_id: intent.id, surcharge_id: surcharge.id, payment_type: "guest_supplemental" },
    });
    await Promise.all([
      admin.from("customer_surcharges").update({ status: "payment_pending" }).eq("id", surcharge.id).eq("status", "customer_approved"),
      admin.from("guest_order_access_tokens").update({ last_used_at: new Date().toISOString() }).eq("id", access.id),
    ]);
    return NextResponse.json({ checkoutUrl: checkout.authorization_url }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    await markPaymentInitializationFailed(admin, intent.id);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Payment is unavailable right now." }, { status: 503 });
  }
}
