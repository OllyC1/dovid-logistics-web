import { createHash } from "node:crypto";

export type PaystackWebhookEvent = {
  event: string;
  data: {
    id?: number | string;
    reference?: string;
    transaction_reference?: string;
    refund_reference?: string;
    amount?: number | string;
    currency?: string;
    status?: string;
    metadata?: Record<string, unknown>;
    transaction?: { reference?: string };
  };
};

export function paymentIntentReference(event: PaystackWebhookEvent) {
  if (event.event.startsWith("refund.")) {
    return event.data.transaction_reference ?? event.data.transaction?.reference ?? null;
  }
  return event.data.reference ?? event.data.transaction_reference ?? event.data.transaction?.reference ?? null;
}

export function providerEventResourceId(event: PaystackWebhookEvent, raw: string) {
  const transactionReference = paymentIntentReference(event);
  if (event.event.startsWith("refund.")) {
    return String(event.data.id ?? event.data.refund_reference ?? `${transactionReference ?? "unknown"}:${event.data.amount ?? "unknown"}`);
  }
  return String(event.data.id ?? event.data.refund_reference ?? createHash("sha256").update(raw).digest("hex"));
}
