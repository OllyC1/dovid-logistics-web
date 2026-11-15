import { expect, test, type Page } from "@playwright/test";

async function mockAddresses(page: Page) {
  await page.route("**/api/maps/places**", route => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/maps/places") {
      const pickup = url.searchParams.get("input")?.toLowerCase().includes("bodija");
      return route.fulfill({ contentType: "application/json", body: JSON.stringify({ suggestions: [{ placeId: pickup ? "pickup-mobile" : "delivery-mobile", description: pickup ? "Bodija, Ibadan" : "Ring Road, Ibadan", mainText: pickup ? "Bodija" : "Ring Road", secondaryText: "Ibadan, Oyo, Nigeria" }] }) });
    }
    const pickup = url.pathname.endsWith("pickup-mobile");
    return route.fulfill({ contentType: "application/json", body: JSON.stringify({ address: pickup ? "Bodija, Ibadan, Nigeria" : "Ring Road, Ibadan, Nigeria", coordinates: pickup ? { latitude: 7.435, longitude: 3.91 } : { latitude: 7.36, longitude: 3.875 } }) });
  });
}

test.beforeEach(async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith("mobile"), "Mobile payment coverage");
  const expectedWidth = testInfo.project.name === "mobile-375" ? 375 : 390;
  expect(await page.evaluate(() => window.innerWidth)).toBe(expectedWidth);
});

test("registration is usable and validates safely", async ({ page }) => {
  await page.goto("/register");
  await page.getByLabel("Full name").fill("Mobile Customer");
  await page.getByLabel("Phone number").fill("08000000000");
  await page.getByLabel("Email address").fill("mobile.customer@example.com");
  await page.getByLabel("Password").fill("short");
  await page.getByRole("button", { name: "Create account" }).click();
  expect(await page.getByLabel("Password").evaluate(input => (input as HTMLInputElement).checkValidity())).toBe(false);
  expect(await page.getByLabel("Password").evaluate(input => (input as HTMLInputElement).validationMessage)).not.toBe("");
});

test("sender can book with address search, enter test checkout, verify, track and see delivery completion", async ({ page }) => {
  test.setTimeout(120_000);
  await mockAddresses(page);
  await page.route("**/api/delivery/quotes", route => route.fulfill({ contentType: "application/json", body: JSON.stringify({ quoteId: "quote-mobile", distanceMeters: 5200, customerTotalKobo: 230000, currency: "NGN", includedCharges: [{ label: "Standard delivery", amountKobo: 230000 }], expiresAt: new Date(Date.now() + 600000).toISOString() }) }));
  await page.route("**/api/delivery/quotes/quote-mobile/confirm", route => route.fulfill({ contentType: "application/json", body: JSON.stringify({ confirmed: true }) }));
  await page.route("**/api/orders", route => route.fulfill({ contentType: "application/json", body: JSON.stringify({ order_id: "mobile-order", order_reference: "DOV-MOBILE" }) }));
  await page.route("**/api/payments/initialize", route => route.fulfill({ contentType: "application/json", body: JSON.stringify({ checkoutUrl: "http://127.0.0.1:3000/mock-mobile-checkout" }) }));
  await page.route("**/mock-mobile-checkout", route => route.fulfill({ contentType: "text/html", body: "<main><h1>Paystack test checkout</h1></main>" }));

  await page.goto("/book");
  await expect(page.locator('[data-hydrated="true"]')).toBeVisible();
  await page.getByLabel("Where should we collect the parcel?").fill("Bodija");
  await page.getByRole("button", { name: /Bodija/ }).click();
  await page.getByLabel("Where should we deliver it?").fill("Ring Road");
  await page.getByRole("button", { name: /Ring Road/ }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(await page.evaluate(() => window.innerWidth));
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Your name").fill("Mobile Sender");
  await page.getByLabel("Your phone number").fill("08000000000");
  await page.getByLabel("Receiver's name").fill("Mobile Receiver");
  await page.getByLabel("Receiver's phone number").fill("08000000001");
  await page.getByRole("button", { name: "See my price" }).click();
  await page.getByRole("button", { name: "Continue to payment" }).click();
  await page.getByRole("button", { name: "Create delivery and pay" }).click();
  await expect(page.getByRole("heading", { name: "Paystack test checkout" })).toBeVisible();

  await page.route("**/api/payments/verify?reference=DOV-MOBILE-PAY", route => route.fulfill({ contentType: "application/json", body: JSON.stringify({ status: "paid", verified: true }) }));
  await page.goto("/pay/callback?reference=DOV-MOBILE-PAY");
  await expect(page.getByText("Payment confirmed. Your delivery can continue.")).toBeVisible();

  await page.route("**/track/TRK-MOBILE", route => route.fulfill({ contentType: "text/html", body: "<main><h1>DOV-MOBILE</h1><p>Delivered</p><p>Delivery confirmed</p></main>" }));
  await page.goto("/track");
  await page.getByLabel("Tracking reference").fill("TRK-MOBILE");
  await page.getByRole("button", { name: "Check delivery status" }).click();
  await expect(page.getByText("Delivered")).toBeVisible();
  await expect(page.getByText("Delivery confirmed")).toBeVisible();
});

test("receiver can use a secure payment link without an account", async ({ page }) => {
  const token = "a".repeat(64);
  await page.route("**/api/payments/receiver", route => route.fulfill({ contentType: "application/json", body: JSON.stringify({ checkoutUrl: "http://127.0.0.1:3000/mock-receiver-checkout" }) }));
  await page.route("**/mock-receiver-checkout", route => route.fulfill({ contentType: "text/html", body: "<main><h1>Receiver test checkout</h1></main>" }));
  await page.goto(`/pay/receiver/${token}`);
  await page.getByLabel("Where should we send the receipt?").fill("receiver@example.com");
  await page.getByRole("button", { name: "Continue to payment" }).click();
  await expect(page.getByRole("heading", { name: "Receiver test checkout" })).toBeVisible();
});
