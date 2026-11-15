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
};

export async function getOrCreateMainPaymentIntent(admin: SupabaseClient, input: MainIntentInput) {
  const now = new Date();
  const { data: active } = await admin.from("payment_intents")
    .select("id,provider_reference,status,expires_at")
    .eq("order_id", input.orderId)
    .is("surcharge_id", null)
    .in("status", ["pending", "processing"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (active && !isPaymentIntentExpired(active.expires_at, now.getTime())) return active;
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
    last_provider_status: "initialized"
  }).select("id,provider_reference,status,expires_at").single();
  if (!error) return data;
  if (error.code !== "23505") throw error;
  const { data: concurrent, error: concurrentError } = await admin.from("payment_intents")
    .select("id,provider_reference,status,expires_at")
    .eq("order_id", input.orderId)
    .is("surcharge_id", null)
    .in("status", ["pending", "processing"])
    .order("created_at", { ascending: false })
    .limit(1)
    .single();
  if (concurrentError) throw concurrentError;
  return concurrent;
}

export async function markPaymentInitializationFailed(admin: SupabaseClient, intentId: string) {
  await admin.from("payment_intents").update({ status: "failed", last_provider_status: "initialization_failed", updated_at: new Date().toISOString() }).eq("id", intentId).neq("status", "paid");
}
