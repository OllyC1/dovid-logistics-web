import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20261126110000_route_payment_receipts_to_payer.sql", "utf8");
const intents = readFileSync("src/features/payments/intents.ts", "utf8");
const guestPayment = readFileSync("src/app/api/payments/guest/route.ts", "utf8");
const receiverPayment = readFileSync("src/app/api/payments/receiver/route.ts", "utf8");
const guestSupplemental = readFileSync("src/app/api/payments/guest/supplemental/route.ts", "utf8");

describe("payment receipt recipient binding", () => {
  it("stores the normalized payer email on each payment intent", () => {
    expect(migration).toContain("add column if not exists receipt_email text");
    expect(intents).toContain("receipt_email: receiptEmail");
    expect(intents).toContain("PaymentReceiptEmailConflictError");
  });

  it("routes payment confirmations to the intent receipt email only", () => {
    expect(migration).toContain("'recipientEmail', new.receipt_email");
    expect(migration).toContain("notification_metadata - 'recipientEmail'");
    expect(migration).toContain("selected_order.notification_email");
  });

  it("binds sender, receiver and supplemental checkout input to the intent", () => {
    expect(guestPayment).toContain("receiptEmail: parsed.data.email");
    expect(receiverPayment).toContain("receiptEmail: parsed.data.email");
    expect(guestSupplemental).toContain("receiptEmail: parsed.data.email");
  });
});
