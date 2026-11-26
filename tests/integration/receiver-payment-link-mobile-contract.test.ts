import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const guestLink = readFileSync("src/components/payments/guest-receiver-link.tsx", "utf8");
const accountLink = readFileSync("src/components/payments/receiver-link.tsx", "utf8");

describe("mobile receiver payment sharing", () => {
  for (const [name, source] of [["guest", guestLink], ["account", accountLink]] as const) {
    it(`${name} flow provides direct, mobile-friendly sharing actions`, () => {
      expect(source).toContain("Send by WhatsApp");
      expect(source).toContain("Copy private link");
      expect(source).toContain("Open payment page");
      expect(source).toContain("min-h-12 w-full");
      expect(source).toContain("Anyone with this link can open the payment page");
    });
  }

  it("explains the no-account receiver journey before sharing", () => {
    expect(guestLink).toContain("They enter their receipt email and pay securely through Paystack.");
    expect(accountLink).toContain("without creating an account");
  });
});
