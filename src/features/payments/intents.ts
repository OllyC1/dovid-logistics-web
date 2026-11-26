import type { SupabaseClient } from "@supabase/supabase-js";

export const PAYMENT_INTENT_TTL_MS = 30 * 60 * 1000;

export function isPaymentIntentExpired(expiresAt: string | null, now = Date.now()) {
  return Boolean(expiresAt && new Date(expiresAt).getTime() <= now);
}

type MainIntentInput = {
  orderId: string;
  orderReference: string;
  amountMinor: number;
  currency: string;
  idempotencyKey?: string;
  receiver: boolean;
  receiptEmail: string;
};

type SupplementalIntentInput = {
  orderId: string;
  orderReference: string;
  surchargeId: string;
  amountMinor: number;
  currency: string;
  idempotencyKey?: string;
  receiptEmail: string;
};

export type PaymentIntentReservation = {
  id: string;
  provider_reference: string;
  status: string;
  expires_at: string | null;
  created_at: string;
  receipt_email: string | null;
  created: boolean;
};

const intentSelection = "id,provider_reference,status,expires_at,created_at,receipt_email";

export class PaymentReceiptEmailConflictError extends Error {
  readonly statusCode = 409;

  constructor() {
    super("This checkout is already linked to a different receipt email. Continue with the original checkout or wait for it to expire before trying again.");
    this.name = "PaymentReceiptEmailConflictError";
  }
}

function assertReceiptEmail(intent: { receipt_email: string | null }, receiptEmail: string) {
  if (intent.receipt_email && intent.receipt_email !== receiptEmail.trim().toLowerCase()) {
    throw new PaymentReceiptEmailConflictError();
  }
}

export async function getOrCreateMainPaymentIntent(admin: SupabaseClient, input: MainIntentInput) {
  const now = new Date();
  const receiptEmail = input.receiptEmail.trim().toLowerCase();
  const { data: active, error: activeError } = await admin.from("payment_intents")
    .select(intentSelection)
    .eq("order_id", input.orderId)
    .is("surcharge_id", null)
    .in("status", ["pending", "processing"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (activeError) throw activeError;
  if (active && !isPaymentIntentExpired(active.expires_at, now.getTime())) {
    assertReceiptEmail(active, receiptEmail);
    return { ...active, created: false } as PaymentIntentReservation;
  }
  if (active) await admin.from("payment_intents").update({ status: "expired", last_provider_status: "locally_expired", updated_at: now.toISOString() }).eq("id", active.id);

  const reference = `${input.orderReference}${input.receiver ? "-R" : ""}-${crypto.randomUUID().slice(0, 8)}`;
  const expiresAt = new Date(now.getTime() + PAYMENT_INTENT_TTL_MS).toISOString();
  const { data, error } = await admin.from("payment_intents").insert({
    order_id: input.orderId,
    provider: "paystack",
    provider_reference: reference,
    amount_minor: input.amountMinor,
    currency: input.currency,
    status: "processing",
    expires_at: expiresAt,
    idempotency_key: input.idempotencyKey ?? null,
    last_provider_status: "initialized",
    receipt_email: receiptEmail,
  }).select(intentSelection).single();
  if (!error) return { ...data, created: true } as PaymentIntentReservation;
  if (error.code !== "23505") throw error;
  const { data: concurrent, error: concurrentError } = await admin.from("payment_intents")
    .select(intentSelection)
    .eq("order_id", input.orderId)
    .is("surcharge_id", null)
    .in("status", ["pending", "processing"])
    .order("created_at", { ascending: false })
    .limit(1)
    .single();
  if (concurrentError) throw concurrentError;
  assertReceiptEmail(concurrent, receiptEmail);
  return { ...concurrent, created: false } as PaymentIntentReservation;
}

export async function getOrCreateSupplementalPaymentIntent(admin: SupabaseClient, input: SupplementalIntentInput) {
  const now = new Date();
  const receiptEmail = input.receiptEmail.trim().toLowerCase();
  const { data: active, error: activeError } = await admin.from("payment_intents")
    .select(intentSelection)
    .eq("surcharge_id", input.surchargeId)
    .in("status", ["pending", "processing", "paid"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (activeError) throw activeError;
  if (active?.status === "paid") {
    assertReceiptEmail(active, receiptEmail);
    return { ...active, created: false } as PaymentIntentReservation;
  }
  if (active && !isPaymentIntentExpired(active.expires_at, now.getTime())) {
    assertReceiptEmail(active, receiptEmail);
    return { ...active, created: false } as PaymentIntentReservation;
  }
  if (active) await admin.from("payment_intents").update({ status: "expired", last_provider_status: "locally_expired", updated_at: now.toISOString() }).eq("id", active.id);

  const reference = `${input.orderReference}-EXTRA-${crypto.randomUUID().slice(0, 8)}`;
  const { data, error } = await admin.from("payment_intents").insert({
    order_id: input.orderId,
    surcharge_id: input.surchargeId,
    provider: "paystack",
    provider_reference: reference,
    amount_minor: input.amountMinor,
    currency: input.currency,
    status: "processing",
    expires_at: new Date(now.getTime() + PAYMENT_INTENT_TTL_MS).toISOString(),
    idempotency_key: input.idempotencyKey ?? null,
    last_provider_status: "initialized",
    receipt_email: receiptEmail,
  }).select(intentSelection).single();
  if (!error) return { ...data, created: true } as PaymentIntentReservation;
  if (error.code !== "23505") throw error;
  const { data: concurrent, error: concurrentError } = await admin.from("payment_intents")
    .select(intentSelection)
    .eq("surcharge_id", input.surchargeId)
    .in("status", ["pending", "processing", "paid"])
    .order("created_at", { ascending: false })
    .limit(1)
    .single();
  if (concurrentError) throw concurrentError;
  assertReceiptEmail(concurrent, receiptEmail);
  return { ...concurrent, created: false } as PaymentIntentReservation;
}

export async function markPaymentInitializationFailed(admin: SupabaseClient, intentId: string) {
  await admin.from("payment_intents").update({ status: "failed", last_provider_status: "initialization_failed", updated_at: new Date().toISOString() }).eq("id", intentId).neq("status", "paid");
}
