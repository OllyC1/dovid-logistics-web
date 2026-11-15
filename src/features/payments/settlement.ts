export type ProviderPayment = { reference: string; amount: number; currency: string; status: string; id: number; domain?: string; metadata?: Record<string, unknown> | string };
export type ProviderEvent = { event: string; data: ProviderPayment & { transaction_reference?: string; transaction?: { reference?: string } } };
export type StoredPaymentIntent = { provider_reference: string; amount_minor: number; currency: string; status: string };

export function matchesStoredPaymentIntent(payment: ProviderPayment, intent: StoredPaymentIntent) {
  return payment.reference === intent.provider_reference && payment.amount === intent.amount_minor && payment.currency === intent.currency;
}

export function shouldSettleProviderEvent(event: ProviderEvent, intent: StoredPaymentIntent) {
  return event.event === "charge.success" && event.data.status === "success" && matchesStoredPaymentIntent(event.data, intent) && !["paid", "partially_refunded", "refunded"].includes(intent.status);
}

export function mapPaystackStatus(status: string) {
  if (status === "success") return "paid" as const;
  if (["failed", "abandoned"].includes(status)) return "failed" as const;
  if (status === "reversed") return "refunded" as const;
  if (["ongoing", "pending", "processing", "queued"].includes(status)) return "processing" as const;
  return "pending" as const;
}

export function providerReferenceFromEvent(event: ProviderEvent) {
  return event.data.reference || event.data.transaction_reference || event.data.transaction?.reference || null;
}
