import { NextResponse, type NextRequest } from "next/server";
import { paymentIntentReference, providerEventResourceId, type PaystackWebhookEvent } from "@/features/payments/webhook-event";
import { shouldSettleProviderEvent } from "@/features/payments/settlement";
import { verifyPaystackWebhookSignature } from "@/lib/paystack/client";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function POST(request: NextRequest) {
  const raw = await request.text();
  const paystackSignature = request.headers.get("paystack-signature");
  const legacySignature = request.headers.get("x-paystack-signature");
  const signatureValid = verifyPaystackWebhookSignature(raw, { paystackSignature, legacySignature });
  const signatureMetadata = {
    paystackUserAgent: request.headers.get("user-agent") === "Paystack/2.0",
    hasTimestampedSignature: Boolean(paystackSignature),
    timestampedSecretConfigured: Boolean(process.env.PAYSTACK_WEBHOOK_SECRET?.startsWith("whsec_")),
    hasLegacySignature: Boolean(legacySignature)
  };
  if (!signatureValid) {
    console.warn("Paystack webhook signature rejected", signatureMetadata);
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }
  console.info("Paystack webhook signature accepted", signatureMetadata);
  try {
    const event = JSON.parse(raw) as PaystackWebhookEvent;
    if (!event.event || !event.data) return NextResponse.json({ error: "Invalid webhook event" }, { status: 400 });
    const admin = createSupabaseAdminClient();
    const resourceId = providerEventResourceId(event, raw);
    const eventId = `${event.event}:${resourceId}`;
    const { error: eventError } = await admin.from("payment_events").insert({ provider: "paystack", provider_event_id: eventId, event_type: event.event, payload: event });
    const duplicate = eventError?.code === "23505";
    if (eventError && !duplicate) throw eventError;

    const reference = paymentIntentReference(event);
    if (!reference) return NextResponse.json({ received: true, ...(duplicate ? { duplicate: true } : {}) });
    const { data: intent } = await admin.from("payment_intents").select("id,order_id,surcharge_id,provider_reference,amount_minor,currency,status").eq("provider_reference", reference).maybeSingle();
    if (!intent) return NextResponse.json({ received: true, ...(duplicate ? { duplicate: true } : {}) });
    const amount = Number(event.data.amount);
    const currency = event.data.currency ?? intent.currency;
    const providerStatus = event.data.status ?? event.event;

    if (event.event === "charge.success" && Number.isInteger(amount) && shouldSettleProviderEvent({ event: event.event, data: { reference, amount, currency, status: providerStatus, id: Number(event.data.id), metadata: event.data.metadata } }, intent)) {
      const { error } = await admin.rpc("record_verified_payment", { payment_intent_id: intent.id, provider_transaction_id: String(event.data.id), event_payload: event });
      if (error) throw error;
    } else if (event.event === "charge.failed") {
      const { error } = await admin.rpc("record_payment_provider_state", { payment_intent_id: intent.id, provider_status: providerStatus, event_payload: event });
      if (error) throw error;
    } else if (event.event.startsWith("refund.")) {
      const { error } = await admin.rpc("record_payment_refund_event", { payment_intent_id: intent.id, provider_refund_id: resourceId, refund_event_type: event.event, refund_amount_minor: Number.isInteger(amount) ? amount : null, refund_currency: currency, event_payload: event });
      if (error) throw error;
    } else if (event.event.startsWith("charge.dispute.")) {
      const { error } = await admin.rpc("record_payment_dispute_event", { payment_intent_id: intent.id, provider_dispute_id: resourceId, dispute_event_type: event.event, dispute_amount_minor: Number.isInteger(amount) ? amount : null, dispute_currency: currency, event_payload: event });
      if (error) throw error;
    }
    return NextResponse.json({ received: true, ...(duplicate ? { duplicate: true } : {}) });
  } catch {
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}
