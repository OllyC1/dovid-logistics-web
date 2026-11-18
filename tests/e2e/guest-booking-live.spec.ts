import { createHash, randomBytes, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";

const runLiveGuestBooking = process.env.RUN_LIVE_GUEST_BOOKING_E2E === "true";
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

test.describe("real guest booking API", () => {
  test.skip(!runLiveGuestBooking || !supabaseUrl || !serviceRoleKey, "Requires the isolated local Supabase stack and explicit guest-booking test flag.");

  test("creates a private delivery without sign-in at mobile widths", async ({ page }, testInfo) => {
    test.skip(!testInfo.project.name.startsWith("mobile"), "The guest journey is mobile-first and is exercised at 375px and 390px.");

    const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const quoteId = randomUUID();
    const guestQuoteToken = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + 60 * 60_000).toISOString();
    const quoteRequest = {
      pickupAddress: "Bodija Market, Ibadan",
      pickupCoordinates: { latitude: 7.435, longitude: 3.91 },
      deliveryAddress: "Ring Road, Ibadan",
      deliveryCoordinates: { latitude: 7.36, longitude: 3.875 },
      packageSize: "small",
      packageCategory: "parcel",
      additionalStops: [],
      oversized: false,
      payer: "sender",
      paymentMethod: "online",
      serviceLevel: "standard",
    };

    const { error: quoteError } = await admin.from("quotes").insert({
      id: quoteId,
      request_payload: quoteRequest,
      distance_meters: 5200,
      amount_minor: 230000,
      currency: "NGN",
      expires_at: expiresAt,
      status: "created",
      service_level: "standard",
      payment_method: "online",
      operational_approval_status: "not_required",
      customer_breakdown: [{ label: "Standard delivery", amountKobo: 230000 }],
    });
    expect(quoteError).toBeNull();
    const { error: tokenError } = await admin.from("guest_quote_access_tokens").insert({
      quote_id: quoteId,
      token_hash: createHash("sha256").update(guestQuoteToken).digest("hex"),
      expires_at: expiresAt,
    });
    expect(tokenError).toBeNull();

    await page.route("**/api/maps/places**", route => {
      const url = new URL(route.request().url());
      if (url.pathname === "/api/maps/places") {
        const pickup = url.searchParams.get("input")?.toLowerCase().includes("bodija");
        return route.fulfill({ contentType: "application/json", body: JSON.stringify({ suggestions: [{ placeId: pickup ? "pickup-place" : "delivery-place", description: pickup ? "Bodija Market, Ibadan" : "Ring Road, Ibadan", mainText: pickup ? "Bodija Market" : "Ring Road", secondaryText: "Ibadan, Oyo, Nigeria" }] }) });
      }
      const pickup = url.pathname.endsWith("pickup-place");
      return route.fulfill({ contentType: "application/json", body: JSON.stringify({ address: pickup ? quoteRequest.pickupAddress : quoteRequest.deliveryAddress, coordinates: pickup ? quoteRequest.pickupCoordinates : quoteRequest.deliveryCoordinates }) });
    });
    await page.route("**/api/delivery/quotes", route => route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        quoteId,
        guestQuoteToken,
        status: "created",
        eligibility: "standard_eligible",
        message: "Great! We can check delivery availability for this route.",
        distanceMeters: 5200,
        customerTotalKobo: 230000,
        currency: "NGN",
        includedCharges: [{ label: "Standard delivery", amountKobo: 230000 }],
        expiresAt,
      }),
    }));

    await page.goto("/book");
    await expect(page.getByText("No account is needed", { exact: false })).toBeVisible();
    await page.getByLabel("Where should we collect the parcel?").fill("Bodija");
    await page.getByRole("button", { name: /Bodija Market/ }).click();
    await page.getByLabel("Where should we deliver it?").fill("Ring Road");
    await page.getByRole("button", { name: /Ring Road/ }).click();
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByLabel("Your name").fill("Guest Sender");
    await page.getByLabel("Your phone number").fill("08000000000");
    await page.getByLabel("Receiver's name").fill("Guest Receiver");
    await page.getByLabel("Receiver's phone number").fill("08000000001");
    await page.getByRole("button", { name: "See my price" }).click();
    await expect(page.getByText(/2,300/).first()).toBeVisible();
    await page.getByRole("button", { name: "Continue to payment" }).click();
    await page.getByRole("button", { name: "Create delivery and pay" }).click();

    await expect(page).toHaveURL(/\/guest\/orders\/[A-Za-z0-9_-]{40,128}$/);
    await expect(page.getByRole("heading", { name: "Your delivery" })).toBeVisible();
    await expect(page.getByText("No account is needed.", { exact: false })).toBeVisible();
    await expect(page.getByLabel("Email address for the payment receipt")).toBeVisible();
    const overflow = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
    expect(overflow.document).toBeLessThanOrEqual(overflow.viewport);
    expect(overflow.body).toBeLessThanOrEqual(overflow.viewport);
  });
});
