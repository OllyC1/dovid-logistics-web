import { expect, test } from "@playwright/test";

const runHostedAcceptance = process.env.RUN_PAYSTACK_HOSTED_E2E === "true";
const guestToken = process.env.PAYSTACK_GUEST_TOKEN;
const receiptEmail = process.env.PAYSTACK_TEST_EMAIL;

test.describe("Paystack supplemental TEST acceptance", () => {
  test.skip(!runHostedAcceptance || !guestToken || !receiptEmail, "Requires an explicitly authorized controlled supplemental TEST charge");

  test("pays a separately approved mandatory charge", async ({ page }) => {
    test.setTimeout(150_000);
    try {
      await page.goto(`/guest/orders/${guestToken}`);
    } catch (error) {
      const message = error instanceof Error ? error.message.replaceAll(guestToken!, "[secure-guest-token]") : "The guest delivery page could not be opened";
      throw new Error(message);
    }
    await expect(page.getByText("Controlled TEST mandatory waiting charge")).toBeVisible();
    await page.getByLabel("Email address for the payment receipt").fill(receiptEmail!);
    await page.getByRole("button", { name: "Pay this charge" }).click();
    await page.waitForURL((url) => url.hostname.endsWith("paystack.com"), { timeout: 30_000 });
    await page.waitForFunction(() => !document.body.innerText.includes("Performing security verification"), undefined, { timeout: 45_000 });
    await expect(page.getByText("Use any of the options below to test the payment flow")).toBeVisible({ timeout: 60_000 });
    await page.getByText("Success", { exact: true }).click();
    await page.getByRole("button", { name: /Pay NGN/ }).click();
    await page.waitForURL((url) => url.hostname === "dovid-logistics-prelaunch.netlify.app" && url.pathname === "/pay/callback", { timeout: 60_000 });
    await expect(page.getByText("Payment confirmed. Your delivery can continue.")).toBeVisible({ timeout: 30_000 });
    await page.screenshot({ path: ".tmp/paystack-supplemental-test-payment-confirmed.png", fullPage: true });
  });
});
