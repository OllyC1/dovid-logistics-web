import type { SupabaseClient } from "@supabase/supabase-js";
import { mapPaystackStatus, matchesStoredPaymentIntent, type StoredPaymentIntent } from "@/features/payments/settlement";
import type { PaystackTransaction } from "@/lib/paystack/client";

export type PaymentIntentRecord = StoredPaymentIntent & { id: string; order_id: string; surcharge_id?: string | null };

export async function applyVerifiedPaystackTransaction(admin: SupabaseClient, intent: PaymentIntentRecord, transaction: PaystackTransaction, source: "callback" | "reconciliation") {
  if (!matchesStoredPaymentIntent(transaction, intent)) throw new Error("Verified transaction does not match the payment request");
  const status = mapPaystackStatus(transaction.status);
  if (status === "paid") {
    const { error } = await admin.rpc("record_verified_payment", { payment_intent_id: intent.id, provider_transaction_id: String(transaction.id), event_payload: { event: "transaction.verify", source, data: transaction } });
    if (error) throw error;
    return status;
  }
  const now = new Date().toISOString();
  const { error } = await admin.from("payment_intents").update({ status, last_provider_status: transaction.status, last_verified_at: now, updated_at: now }).eq("id", intent.id).neq("status", "paid");
  if (error) throw error;
  if (!intent.surcharge_id) await admin.from("delivery_orders").update({ payment_status: status, updated_at: now }).eq("id", intent.order_id).neq("payment_status", "paid");
  return status;
}
