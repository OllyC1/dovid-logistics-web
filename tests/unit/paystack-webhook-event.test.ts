import { describe, expect, it } from "vitest";
import { paymentIntentReference, providerEventResourceId, type PaystackWebhookEvent } from "@/features/payments/webhook-event";

describe("Paystack webhook event routing", () => {
  it("uses the original transaction reference for refund events", () => {
    const event: PaystackWebhookEvent = {
      event: "refund.pending",
      data: {
        id: 42,
        reference: "refund-reference",
        refund_reference: "refund-reference",
        transaction_reference: "payment-intent-reference",
        amount: 230000,
        currency: "NGN",
      },
    };

    expect(paymentIntentReference(event)).toBe("payment-intent-reference");
    expect(providerEventResourceId(event, JSON.stringify(event))).toBe("42");
  });

  it("keeps charge events bound to their payment reference", () => {
    const event: PaystackWebhookEvent = {
      event: "charge.success",
      data: { id: 99, reference: "payment-intent-reference", amount: 230000, currency: "NGN" },
    };

    expect(paymentIntentReference(event)).toBe("payment-intent-reference");
    expect(providerEventResourceId(event, JSON.stringify(event))).toBe("99");
  });
});
