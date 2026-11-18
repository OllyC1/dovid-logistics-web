// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const refresh = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/components/maps/address-autocomplete", () => ({
  AddressAutocomplete: ({ label, onChange }: { label: string; onChange: (value: { address: string; latitude: string; longitude: string }) => void }) => (
    <button type="button" onClick={() => onChange({ address: `${label}, Ibadan`, latitude: label.startsWith("Pickup") ? "7.43" : "7.38", longitude: label.startsWith("Pickup") ? "3.91" : "3.88" })}>Choose {label}</button>
  ),
}));

import { AssistedBookingConsole } from "@/components/admin/assisted-booking-console";

function completeContactStep() {
  fireEvent.change(screen.getByLabelText("Customer name"), { target: { value: "Aunty Bola" } });
  fireEvent.change(screen.getByLabelText("Customer phone"), { target: { value: "08010000000" } });
  fireEvent.change(screen.getByLabelText("Sender name"), { target: { value: "Aunty Bola" } });
  fireEvent.change(screen.getByLabelText("Sender phone"), { target: { value: "08010000000" } });
  fireEvent.change(screen.getByLabelText("Recipient name"), { target: { value: "Mr Ade" } });
  fireEvent.change(screen.getByLabelText("Recipient phone"), { target: { value: "08020000000" } });
  fireEvent.click(screen.getByRole("button", { name: "Continue to delivery details" }));
}

function completeDeliveryStep() {
  fireEvent.click(screen.getByRole("button", { name: "Choose Pickup address" }));
  fireEvent.click(screen.getByRole("button", { name: "Choose Destination address" }));
  fireEvent.change(screen.getByLabelText("What is being sent?"), { target: { value: "A sealed medicine parcel" } });
  fireEvent.click(screen.getByRole("button", { name: "Continue to payment choices" }));
}

beforeEach(() => {
  refresh.mockReset();
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("AssistedBookingConsole", () => {
  it("guides staff through three mobile-sized steps and keeps customer email optional", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "draft-1" }), { status: 201, headers: { "Content-Type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        quote: { amountMinor: 250000, currency: "NGN", distanceMeters: 5200, duration: "1200s" },
        reviewUrl: "https://example.test/assisted/quote/secure-token",
        verificationCode: "482913",
        whatsappUrl: "https://wa.me/2348010000000",
        automatedMessageSent: false,
      }), { status: 200, headers: { "Content-Type": "application/json" } }));

    render(<AssistedBookingConsole drafts={[]} />);
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("1");
    expect(screen.getByText(/email remains optional/i)).toBeTruthy();

    completeContactStep();
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("2");
    completeDeliveryStep();
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("3");
    expect(screen.getByText(/This is a request, not a confirmed booking/)).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Who pays?"), { target: { value: "receiver_at_delivery" } });
    fireEvent.click(screen.getByRole("button", { name: "Create request and check availability" }));

    expect(await screen.findByText("Secure customer review link created.")).toBeTruthy();
    expect(screen.getByDisplayValue("https://example.test/assisted/quote/secure-token")).toBeTruthy();
    expect(screen.getByText("482913")).toBeTruthy();
    expect(screen.getByText(/No automated message was sent/)).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const request = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body)) as Record<string, unknown>;
    expect(request).not.toHaveProperty("customerEmail");
    expect(request.payer).toBe("receiver_at_delivery");
    expect(request.pickupCoordinates).toEqual({ latitude: 7.43, longitude: 3.91 });
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("keeps manual-approval requests unconfirmed and does not invent a customer link", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "draft-2" }), { status: 201, headers: { "Content-Type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ message: "This route needs confirmation from our dispatch team.", confirmedBookingCreated: false }), { status: 202, headers: { "Content-Type": "application/json" } }));
    render(<AssistedBookingConsole drafts={[]} />);
    completeContactStep();
    completeDeliveryStep();
    fireEvent.click(screen.getByRole("button", { name: "Create request and check availability" }));

    expect(await screen.findByText("This route needs confirmation from our dispatch team.")).toBeTruthy();
    expect(screen.queryByLabelText("Secure customer review link")).toBeNull();
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("recovers from a provider or network failure without claiming a booking", async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new TypeError("offline"));
    render(<AssistedBookingConsole drafts={[]} />);
    completeContactStep();
    completeDeliveryStep();
    fireEvent.click(screen.getByRole("button", { name: "Create request and check availability" }));

    expect((await screen.findByRole("alert")).textContent).toContain("no booking or charge was created");
    await waitFor(() => expect((screen.getByRole("button", { name: "Create request and check availability" }) as HTMLButtonElement).disabled).toBe(false));
  });
});
