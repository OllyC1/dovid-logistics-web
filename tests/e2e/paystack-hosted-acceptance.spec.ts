import { expect, test } from "@playwright/test";

const runHostedAcceptance = process.env.RUN_PAYSTACK_HOSTED_E2E === "true";
const guestToken = process.env.PAYSTACK_GUEST_TOKEN;
const receiptEmail = process.env.PAYSTACK_TEST_EMAIL;

test.describe("Paystack hosted TEST acceptance", () => {
  test.skip(!runHostedAcceptance || !guestToken || !receiptEmail, "Requires an explicitly authorized controlled TEST order");

  test("opens the controlled sender order in Paystack hosted checkout", async ({ page }) => {
    test.setTimeout(120_000);
    try {
      await page.goto(`/guest/orders/${guestToken}`);
    } catch (error) {
      const message = error instanceof Error ? error.message.replaceAll(guestToken!, "[secure-test-token]") : "The guest order could not be opened";
      throw new Error(message);
    }
    await expect(page.getByRole("heading", { name: "Your delivery" })).toBeVisible();
    await expect(page.getByText("DOV-E2E-PAY-", { exact: false })).toBeVisible();
    const mainPayment = page.getByRole("article").filter({ has: page.getByRole("heading", { name: "Payment", exact: true }) });
    await mainPayment.getByLabel("Email address for the payment receipt").fill(receiptEmail!);
    await mainPayment.getByRole("button", { name: "Pay securely" }).click();
    await page.waitForURL((url) => url.hostname.endsWith("paystack.com"), { timeout: 30_000 });
    expect(new URL(page.url()).protocol).toBe("https:");
    await page.waitForFunction(() => !document.body.innerText.includes("Performing security verification"), undefined, { timeout: 45_000 });
    await expect(page.getByText("Use any of the options below to test the payment flow")).toBeVisible({ timeout: 60_000 });
    await page.getByText("Success", { exact: true }).click();
    await page.getByRole("button", { name: /Pay NGN/ }).click();
    await page.waitForURL((url) => ["dovidlogistics.com", "www.dovidlogistics.com"].includes(url.hostname) && url.pathname === "/pay/callback", { timeout: 60_000 });
    await expect(page.getByText("Payment confirmed. Your delivery can continue.")).toBeVisible({ timeout: 30_000 });
    await page.screenshot({ path: ".tmp/paystack-hosted-test-payment-confirmed.png", fullPage: true });
  });
});
