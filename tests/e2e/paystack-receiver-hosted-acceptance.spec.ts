import { expect, test } from "@playwright/test";

const runHostedAcceptance = process.env.RUN_PAYSTACK_HOSTED_E2E === "true";
const receiverToken = process.env.PAYSTACK_RECEIVER_TOKEN;
const receiptEmail = process.env.PAYSTACK_TEST_EMAIL;

test.describe("Paystack receiver TEST acceptance", () => {
  test.skip(!runHostedAcceptance || !receiverToken || !receiptEmail, "Requires an explicitly authorized controlled receiver TEST order");

  test("pays through a secure receiver link without an account", async ({ page }) => {
    test.setTimeout(150_000);
    try {
      await page.goto(`/pay/receiver/${receiverToken}`);
    } catch (error) {
      const message = error instanceof Error ? error.message.replaceAll(receiverToken!, "[secure-receiver-token]") : "The receiver payment page could not be opened";
      throw new Error(message);
    }
    await expect(page.getByRole("heading", { name: "Pay for this delivery" })).toBeVisible();
    await page.getByLabel("Where should we send the receipt?").fill(receiptEmail!);
    await page.getByRole("button", { name: "Continue to payment" }).click();
    await page.waitForURL((url) => url.hostname.endsWith("paystack.com"), { timeout: 30_000 });
    await page.waitForFunction(() => !document.body.innerText.includes("Performing security verification"), undefined, { timeout: 45_000 });
    await expect(page.getByText("Use any of the options below to test the payment flow")).toBeVisible({ timeout: 60_000 });
    await page.getByText("Success", { exact: true }).click();
    await page.getByRole("button", { name: /Pay NGN/ }).click();
    await page.waitForURL((url) => ["dovidlogistics.com", "www.dovidlogistics.com"].includes(url.hostname) && url.pathname === "/pay/callback", { timeout: 60_000 });
    await expect(page.getByText("Payment confirmed. Your delivery can continue.")).toBeVisible({ timeout: 30_000 });
    await page.screenshot({ path: ".tmp/paystack-receiver-test-payment-confirmed.png", fullPage: true });
  });
});
