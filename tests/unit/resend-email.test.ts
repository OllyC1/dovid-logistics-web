import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ResendNotificationProvider, NotificationProviderError } from "@/lib/notifications/provider";
import { getTransactionalEmailPurpose, renderTransactionalEmail, transactionalEmailPurposes, UnsupportedTransactionalEmailEventError } from "@/lib/notifications/templates";
import { verifyResendWebhook } from "@/lib/resend/webhook";

afterEach(() => vi.unstubAllGlobals());

describe("Resend transactional email", () => {
  it("sends HTML and plain text with a provider idempotency key", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "email_test_1" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const provider = new ResendNotificationProvider("re_test", "Dovid Logistics <notifications@example.com>");
    await expect(provider.send({ to: "recipient@example.com", subject: "Update", html: "<p>Update</p>", text: "Update", deduplicationKey: "order/update/1" })).resolves.toEqual({ providerId: "email_test_1" });
    expect(fetchMock).toHaveBeenCalledWith("https://api.resend.com/emails", expect.objectContaining({ headers: expect.objectContaining({ "Idempotency-Key": "order/update/1" }) }));
  });

  it("classifies quota responses as retryable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ name: "daily_quota_exceeded", message: "Quota reached" }), { status: 429, headers: { "retry-after": "3600" } })));
    const provider = new ResendNotificationProvider("re_test", "Dovid Logistics <notifications@example.com>");
    await expect(provider.send({ to: "recipient@example.com", subject: "Update", html: "<p>Update</p>", text: "Update", deduplicationKey: "order/update/2" })).rejects.toMatchObject({ code: "daily_quota_exceeded", retryable: true, retryAfterSeconds: 3600 } satisfies Partial<NotificationProviderError>);
  });

  it("classifies rejected requests as permanent failures", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ name: "validation_error", message: "Invalid recipient" }), { status: 422 })));
    const provider = new ResendNotificationProvider("re_test", "Dovid Logistics <notifications@example.com>");
    await expect(provider.send({ to: "recipient@example.com", subject: "Update", html: "<p>Update</p>", text: "Update", deduplicationKey: "order/update/3" })).rejects.toMatchObject({ code: "validation_error", retryable: false } satisfies Partial<NotificationProviderError>);
  });

  it("verifies Svix signatures and rejects stale requests", () => {
    const secretBytes = Buffer.from("resend-test-secret");
    const secret = `whsec_${secretBytes.toString("base64")}`;
    const payload = JSON.stringify({ type: "email.delivered", data: { email_id: "email_test_1" } });
    const id = "msg_test";
    const timestamp = 1_800_000_000;
    const signature = createHmac("sha256", secretBytes).update(`${id}.${timestamp}.${payload}`).digest("base64");
    expect(verifyResendWebhook({ payload, id, timestamp: String(timestamp), signature: `v1,${signature}`, secret, nowSeconds: timestamp })).toBe(true);
    expect(verifyResendWebhook({ payload, id, timestamp: String(timestamp), signature: `v1,${signature}`, secret, nowSeconds: timestamp + 301 })).toBe(false);
  });

  it("escapes user-controlled content and includes a text alternative", () => {
    const rendered = renderTransactionalEmail({ eventType: "delivery_failed", heading: "Untrusted heading", body: "Review <update> & continue", metadata: { orderReference: "DOV-1", actionPath: "/account/orders/1" } });
    expect(rendered.html).toContain("Review &lt;update&gt; &amp; continue");
    expect(rendered.html).not.toContain("Review <update>");
    expect(rendered.html).not.toContain("Untrusted heading");
    expect(rendered.text).toContain("DOV-1");
  });

  it("renders enquiry acknowledgement as an enquiry with no delivery or account action", () => {
    const rendered = renderTransactionalEmail({
      eventType: "website_enquiry_acknowledged",
      heading: "We received your message",
      body: "Thank you for contacting Dovid Logistics.",
      metadata: { actionPath: "/contact", enquiryKind: "support" }
    });

    expect(rendered.html).toContain("Support enquiry received");
    expect(rendered.subject).toBe("We received your Dovid Logistics enquiry");
    expect(rendered.html).toContain("Thank you — your message is with our team");
    expect(rendered.html).not.toContain("Delivery update");
    expect(rendered.html).not.toContain("View secure update");
    expect(rendered.html).not.toContain("href=");
    expect(rendered.text).not.toContain("https://");
    expect(rendered.text).toContain("You do not need to sign in or make a payment for an enquiry.");
  });

  it("renders an internal enquiry with readable fields and its staff action", () => {
    const rendered = renderTransactionalEmail({
      eventType: "website_enquiry_received",
      heading: "New website support enquiry",
      body: "Name: Test Customer\nEmail: customer@example.com\n\nMessage:\nPlease call me.",
      metadata: { actionPath: "/admin", enquiryKind: "support", enquirySubject: "Please call me" }
    });

    expect(rendered.html).toContain("New support enquiry");
    expect(rendered.subject).toBe("New Dovid Logistics support enquiry: Please call me");
    expect(rendered.html).toContain("Name: Test Customer<br>Email: customer@example.com");
    expect(rendered.html).toContain("Open enquiries");
    expect(rendered.html).toContain("Customer contact details are confidential.");
    expect(rendered.html).not.toContain("send money to a rider");
  });

  it("uses payment-specific structure and the payment amount", () => {
    const rendered = renderTransactionalEmail({
      eventType: "payment_confirmed",
      heading: "Payment confirmed",
      body: "Your payment has been verified.",
      metadata: { actionPath: "/account/orders/test", amountMinor: 250000, currency: "NGN", paymentStatus: "paid" }
    });

    expect(rendered.subject).toBe("Your Dovid Logistics payment is confirmed");
    expect(rendered.html).toContain("Payment receipt");
    expect(rendered.html).toContain("View payment details");
    expect(rendered.text).toContain("₦2,500.00");
    expect(rendered.html).not.toContain("Track delivery");
  });

  it("does not create a button for an unsafe action and refuses an unreviewed email event", () => {
    const unsafe = renderTransactionalEmail({ eventType: "booking_confirmed", heading: "Confirmed", body: "Done", metadata: { actionPath: "//malicious.example" } });

    expect(unsafe.html).not.toContain("href=");
    expect(() => renderTransactionalEmail({ eventType: "unreviewed_event", heading: "Update", body: "Details", metadata: { actionPath: "/account" } }))
      .toThrow(UnsupportedTransactionalEmailEventError);
  });

  it("has an explicit presentation for every application email event", () => {
    expect(Object.keys(transactionalEmailPurposes).sort()).toEqual([
      "additional_fee_request",
      "booking_confirmed",
      "delivery_failed",
      "dispatch.approval_queue",
      "dispatch.approval_requested",
      "dispatch_request_approved",
      "dispatch_request_rejected",
      "package_collected",
      "package_delivered",
      "payment_confirmed",
      "production_readiness_test",
      "redelivery_scheduled",
      "staff_invitation_existing_user",
      "website_enquiry_acknowledged",
      "website_enquiry_received"
    ]);
    expect(getTransactionalEmailPurpose("website_enquiry_received")).toBe(transactionalEmailPurposes.website_enquiry_received);
  });

  it.each([
    ["booking_confirmed", "Your delivery is confirmed", "confirmed"],
    ["package_collected", "Your delivery is on the way", "collected"],
    ["package_delivered", "Your package has been delivered", "completed"],
    ["payment_confirmed", "Payment confirmed", "verified"]
  ])("renders the branded %s notification", (eventType, heading, body) => {
    const rendered = renderTransactionalEmail({
      eventType,
      heading,
      body: `Your delivery has been ${body}.`,
      metadata: { orderReference: "DOV-EMAIL-TEST", actionPath: "/account/orders/test" }
    });

    expect(rendered.html).toContain("Dovid <span");
    expect(rendered.html).toContain(heading);
    expect(rendered.html).toContain("DOV-EMAIL-TEST");
    expect(rendered.text).toContain("Dovid Logistics");
    expect(rendered.text).toContain(heading);
  });

  it.each([
    ["booking_confirmed", "Your Dovid Logistics booking is confirmed", "View booking"],
    ["package_collected", "Your package has been collected", "Track delivery"],
    ["package_delivered", "Your Dovid Logistics delivery is complete", "View delivery receipt"],
    ["delivery_failed", "Action needed: we could not complete your delivery", "Review next steps"],
    ["payment_confirmed", "Your Dovid Logistics payment is confirmed", "View payment details"],
    ["additional_fee_request", "Review an approved Dovid Logistics delivery charge", "Review and pay charge"],
    ["redelivery_scheduled", "Your Dovid Logistics redelivery is scheduled", "View redelivery details"],
    ["dispatch_request_approved", "Your Dovid Logistics route is approved", "Continue booking"],
    ["dispatch_request_rejected", "Update on your Dovid Logistics route request", "Plan another route"]
  ])("locks %s to its own subject and action", (eventType, subject, actionLabel) => {
    const rendered = renderTransactionalEmail({
      eventType,
      heading: "Generic delivery update",
      body: "Purpose-specific message body.",
      metadata: { actionPath: "/account", orderReference: "DOV-PURPOSE-1", amountMinor: 250000, currency: "NGN" }
    });

    expect(rendered.subject).toBe(subject);
    expect(rendered.html).toContain(actionLabel);
    expect(rendered.html).not.toContain("Generic delivery update");
    expect(rendered.html).not.toContain("View secure update");
  });

  it("uses a staff invitation instead of disguising onboarding as password recovery", () => {
    const rendered = renderTransactionalEmail({
      eventType: "staff_invitation_existing_user",
      body: "Sign in with your existing account to review this invitation.",
      metadata: { actionPath: "/login", staffRole: "rider", expiresAt: "2026-11-27T10:00:00Z" }
    });

    expect(rendered.subject).toBe("You've been invited as a Dovid Logistics rider");
    expect(rendered.html).toContain("Join Dovid Logistics as a rider");
    expect(rendered.html).toContain("Review staff invitation");
    expect(rendered.html).not.toContain("Reset your password");
  });
});
