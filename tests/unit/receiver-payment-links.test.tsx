// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GuestReceiverLink } from "@/components/payments/guest-receiver-link";
import { ReceiverLink } from "@/components/payments/receiver-link";

const receiverToken = "a".repeat(64);

beforeEach(() => {
  sessionStorage.clear();
  vi.stubGlobal("fetch", vi.fn());
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("receiver payment links", () => {
  it("creates a private guest link with simple mobile sharing choices", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ receiverToken }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));

    render(<GuestReceiverLink orderId="order-1" guestToken="guest-token" />);
    fireEvent.click(screen.getByRole("button", { name: "Create receiver payment link" }));

    expect((await screen.findByRole("status")).textContent).toContain("Receiver payment link is ready.");
    expect(screen.getByRole("link", { name: "Send by WhatsApp" }).getAttribute("href")).toContain("https://wa.me/");
    expect(screen.getByRole("link", { name: "Open payment page" }).getAttribute("href")).toBe(`http://localhost:3000/pay/receiver/${receiverToken}`);
    expect(sessionStorage.getItem("dovid-receiver-token-order-1")).toBe(receiverToken);

    fireEvent.click(screen.getByRole("button", { name: "Copy private link" }));
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith(`http://localhost:3000/pay/receiver/${receiverToken}`));
    expect(screen.getByRole("status").textContent).toContain("Link copied.");
  });

  it("gives signed-in customers the same no-account receiver actions", () => {
    sessionStorage.setItem("dovid-receiver-token-order-2", receiverToken);
    render(<ReceiverLink orderId="order-2" />);

    expect(screen.getByText(/without creating an account/i)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Send by WhatsApp" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Copy private link" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open payment page" })).toBeTruthy();
  });
});
