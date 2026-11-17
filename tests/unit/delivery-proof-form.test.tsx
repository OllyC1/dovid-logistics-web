// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DeliveryProofForm } from "@/components/rider/delivery-proof-form";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
afterEach(cleanup);

describe("DeliveryProofForm", () => {
  it("blocks the handover form while verified payment is outstanding", () => {
    render(<DeliveryProofForm orderId="order-1" expectedRecipientName="Ayo" deliveryStatus="arrived_at_destination" paymentStatus="pending" existingProof={null} />);
    expect(screen.getByText(/Verified payment is still outstanding/i)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Record recipient confirmation" })).toBeNull();
  });

  it("shows mobile-friendly recipient controls only after payment", () => {
    render(<DeliveryProofForm orderId="order-1" expectedRecipientName="Ayo" deliveryStatus="arrived_at_destination" paymentStatus="paid" existingProof={null} />);
    expect((screen.getByLabelText("Name of person receiving the parcel") as HTMLInputElement).value).toBe("Ayo");
    expect((screen.getByRole("checkbox") as HTMLInputElement).required).toBe(true);
    expect(screen.getByRole("button", { name: "Record recipient confirmation" })).toBeTruthy();
  });

  it("shows the immutable confirmation summary after proof is recorded", () => {
    render(<DeliveryProofForm orderId="order-1" expectedRecipientName="Ayo" deliveryStatus="delivered" paymentStatus="paid" existingProof={{ completedAt: "2026-11-17T09:00:00.000Z", recipientName: "Ayo" }} />);
    expect(screen.getByRole("heading", { name: "Recipient confirmation recorded" })).toBeTruthy();
    expect(screen.getByText(/Payment is checked again on the server/i)).toBeTruthy();
  });
});
