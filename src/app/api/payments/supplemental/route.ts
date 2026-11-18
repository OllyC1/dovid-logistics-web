import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getOrInitializePaymentCheckout, paymentCheckoutErrorStatus } from "@/features/payments/checkout";
import { getOrCreateSupplementalPaymentIntent } from "@/features/payments/intents";
import { getAuthenticatedRole } from "@/lib/auth/roles";
import { publicEnv } from "@/lib/env";
import { initializePaystackPayment } from "@/lib/paystack/client";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const schema = z.object({ surchargeId: z.uuid() });

export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedRole();
  if (!auth?.user.email || auth.role !== "customer") return NextResponse.json({ error: "Customer sign-in is required" }, { status: 401 });
  const customerEmail = auth.user.email;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid supplemental charge" }, { status: 400 });
  const admin = createSupabaseAdminClient();
  const { data: surcharge } = await admin.from("customer_surcharges").select("id,order_id,status,approved_amount_kobo,category,delivery_orders!inner(customer_id,order_reference,currency,delivery_status)").eq("id", parsed.data.surchargeId).maybeSingle();
  const order = Array.isArray(surcharge?.delivery_orders) ? surcharge.delivery_orders[0] : surcharge?.delivery_orders;
  if (!surcharge || order?.customer_id !== auth.user.id) return NextResponse.json({ error: "Supplemental charge not found" }, { status: 404 });
  if (["cancelled", "delivered"].includes(order.delivery_status)) return NextResponse.json({ error: "This delivery can no longer accept payment" }, { status: 409 });
  if (surcharge.status === "paid") return NextResponse.json({ error: "This charge is already paid" }, { status: 409 });
  if (!["customer_approved", "payment_pending"].includes(surcharge.status) || !surcharge.approved_amount_kobo) return NextResponse.json({ error: "Customer approval is required before payment" }, { status: 409 });
  if (!new Set(["waiting_time", "toll_road_access", "redelivery", "authorized_parking_access", "extra_stop", "address_correction", "return_journey", "other"]).has(surcharge.category)) return NextResponse.json({ error: "Unsupported supplemental charge" }, { status: 409 });

  try {
    const intent = await getOrCreateSupplementalPaymentIntent(admin, { orderId: surcharge.order_id, orderReference: order.order_reference, surchargeId: surcharge.id, amountMinor: surcharge.approved_amount_kobo, currency: order.currency });
    if (intent.status === "paid") return NextResponse.json({ error: "This charge is already paid" }, { status: 409 });
    const checkout = await getOrInitializePaymentCheckout(admin, intent, () => initializePaystackPayment({ email: customerEmail, amountMinor: surcharge.approved_amount_kobo, reference: intent.provider_reference, callbackUrl: `${publicEnv.NEXT_PUBLIC_APP_URL}/pay/callback`, metadata: { order_id: surcharge.order_id, payment_intent_id: intent.id, surcharge_id: surcharge.id, payment_type: "supplemental" } }));
    await admin.from("customer_surcharges").update({ status: "payment_pending" }).eq("id", surcharge.id);
    return NextResponse.json({ checkoutUrl: checkout.authorization_url });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Supplemental payment is unavailable" }, { status: paymentCheckoutErrorStatus(error) });
  }
}
