import { expect, test } from "@playwright/test";

const runHostedAcceptance = process.env.RUN_PAYSTACK_HOSTED_E2E === "true";
const guestToken = process.env.PAYSTACK_GUEST_TOKEN;
const receiptEmail = process.env.PAYSTACK_TEST_EMAIL;

test.describe("Paystack hosted TEST acceptance", () => {
  test.skip(!runHostedAcceptance || !guestToken || !receiptEmail, "Requires an explicitly authorized controlled TEST order");

  test("opens the controlled sender order in Paystack hosted checkout", async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto(`/guest/orders/${guestToken}`);
    await expect(page.getByRole("heading", { name: "Your delivery" })).toBeVisible();
    await expect(page.getByText("DOV-E2E-PAY-", { exact: false })).toBeVisible();
    await page.getByLabel("Email address for the payment receipt").fill(receiptEmail!);
    await page.getByRole("button", { name: "Pay securely" }).click();
    await page.waitForURL((url) => url.hostname.endsWith("paystack.com"), { timeout: 30_000 });
    expect(new URL(page.url()).protocol).toBe("https:");
    await page.waitForFunction(() => !document.body.innerText.includes("Performing security verification"), undefined, { timeout: 45_000 });
    await page.screenshot({ path: ".tmp/paystack-hosted-test-checkout.png", fullPage: true });
  });
});
