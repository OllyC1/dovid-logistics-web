import type { SupabaseClient } from "@supabase/supabase-js";
import { markPaymentInitializationFailed, PaymentReceiptEmailConflictError, type PaymentIntentReservation } from "@/features/payments/intents";

const INITIALIZATION_GRACE_MS = 60_000;

type ProviderCheckout = {
  authorization_url: string;
  reference: string;
};

type CheckoutSession = {
  status: "initializing" | "ready" | "failed";
  authorization_url: string | null;
  expires_at: string;
  updated_at: string;
};

export class PaymentCheckoutInProgressError extends Error {
  readonly statusCode = 409;

  constructor(message = "Payment setup is still finishing. Please try again in a moment.") {
    super(message);
    this.name = "PaymentCheckoutInProgressError";
  }
}

function isSafeCheckoutUrl(value: string | null) {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "checkout.paystack.com";
  } catch {
    return false;
  }
}

export function classifyCheckoutSession(session: CheckoutSession | null, intentCreatedAt: string, now = Date.now()) {
  if (session?.status === "ready" && new Date(session.expires_at).getTime() > now && isSafeCheckoutUrl(session.authorization_url)) return "ready" as const;
  const lastActivity = session ? new Date(session.updated_at).getTime() : new Date(intentCreatedAt).getTime();
  if ((!session || session.status === "initializing") && now - lastActivity < INITIALIZATION_GRACE_MS) return "initializing" as const;
  return "stale" as const;
}

export function paymentCheckoutErrorStatus(error: unknown) {
  return error instanceof PaymentCheckoutInProgressError || error instanceof PaymentReceiptEmailConflictError
    ? error.statusCode
    : 503;
}

export async function getOrInitializePaymentCheckout(
  admin: SupabaseClient,
  intent: PaymentIntentReservation,
  initialize: () => Promise<ProviderCheckout>,
) {
  if (intent.status === "paid") throw new Error("This payment is already complete.");

  if (!intent.created) {
    const { data: session, error } = await admin.from("payment_checkout_sessions")
      .select("status,authorization_url,expires_at,updated_at")
      .eq("payment_intent_id", intent.id)
      .maybeSingle();
    if (error) throw error;
    const state = classifyCheckoutSession(session as CheckoutSession | null, intent.created_at);
    if (state === "ready") {
      return { authorization_url: session!.authorization_url!, reference: intent.provider_reference, reused: true };
    }
    if (state === "initializing") throw new PaymentCheckoutInProgressError();
    await markPaymentInitializationFailed(admin, intent.id);
    throw new Error("The previous payment setup expired. Please try again to open a fresh checkout.");
  }

  let sessionInserted = false;
  try {
    const now = new Date().toISOString();
    const { error: insertError } = await admin.from("payment_checkout_sessions").insert({
      payment_intent_id: intent.id,
      provider: "paystack",
      status: "initializing",
      expires_at: intent.expires_at,
      created_at: now,
      updated_at: now,
    });
    if (insertError) throw insertError;
    sessionInserted = true;

    const checkout = await initialize();
    if (checkout.reference !== intent.provider_reference || !isSafeCheckoutUrl(checkout.authorization_url)) {
      throw new Error("Payment provider returned an invalid checkout session");
    }
    const { data: updatedSession, error: updateError } = await admin.from("payment_checkout_sessions").update({
      status: "ready",
      authorization_url: checkout.authorization_url,
      updated_at: new Date().toISOString(),
    }).eq("payment_intent_id", intent.id).eq("status", "initializing").select("payment_intent_id").maybeSingle();
    if (updateError) throw updateError;
    if (!updatedSession) throw new Error("Payment checkout session could not be secured");
    return { ...checkout, reused: false };
  } catch (error) {
    if (sessionInserted) {
      await admin.from("payment_checkout_sessions").update({
        status: "failed",
        failure_code: "provider_initialization_failed",
        updated_at: new Date().toISOString(),
      }).eq("payment_intent_id", intent.id).eq("status", "initializing");
    }
    await markPaymentInitializationFailed(admin, intent.id);
    throw error;
  }
}
