// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AttemptResolutionCard, type AttemptForReview } from "@/components/admin/attempt-resolution-card";

vi.mock("@/components/maps/address-autocomplete", () => ({
  AddressAutocomplete: ({ label, onChange }: { label: string; onChange: (value: { address: string; latitude: string; longitude: string }) => void }) => <button type="button" onClick={() => onChange({ address: "12 Ring Road, Ibadan", latitude: "7.36", longitude: "3.875" })}>{label}</button>,
}));

const attempt: AttemptForReview = {
  id: "attempt-id",
  order_id: "8a13d719-1d12-44f0-8be9-a729f67ba839",
  attempt_number: 2,
  status: "recipient_unavailable",
  failure_reason: "Receiver did not answer after verified contact attempts",
  created_at: "2026-11-18T12:00:00.000Z",
  delivery_orders: {
    order_reference: "DOV-2026-0142",
    pickup_address: "Bodija, Ibadan",
    delivery_address: "Dugbe, Ibadan",
    recipient_name: "Test Receiver",
    recipient_phone: "08000000001",
  },
};

describe("AttemptResolutionCard", () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(cleanup);

  it("shows human order details and submits an explicitly scheduled redelivery", async () => {
    const onResolve = vi.fn().mockResolvedValue(undefined);
    render(<AttemptResolutionCard attempt={attempt} pending={false} onResolve={onResolve} />);

    expect(screen.getByText("DOV-2026-0142")).toBeTruthy();
    expect(screen.queryByText(attempt.order_id)).toBeNull();
    fireEvent.change(screen.getByLabelText("Who caused the failed attempt?"), { target: { value: "customer" } });
    fireEvent.change(screen.getByLabelText("Agreed redelivery date and time"), { target: { value: "2026-11-20T14:30" } });
    fireEvent.change(screen.getByLabelText("Decision reason and verification evidence"), { target: { value: "Receiver confirmed the new time by phone." } });
    fireEvent.click(screen.getByRole("button", { name: "Save reviewed resolution" }));

    await waitFor(() => expect(onResolve).toHaveBeenCalledTimes(1));
    expect(onResolve).toHaveBeenCalledWith("attempt-id", expect.objectContaining({
      resolution: "schedule_redelivery",
      attributableTo: "customer",
      reason: "Receiver confirmed the new time by phone.",
      scheduledAt: new Date("2026-11-20T14:30").toISOString(),
    }));
    expect(screen.getByText(/must be proposed separately, approved and paid/)).toBeTruthy();
  });

  it("requires a verified suggestion for a corrected address", async () => {
    const onResolve = vi.fn().mockResolvedValue(undefined);
    render(<AttemptResolutionCard attempt={attempt} pending={false} onResolve={onResolve} />);
    fireEvent.change(screen.getByLabelText("What should happen next?"), { target: { value: "correct_address" } });
    const submit = screen.getByRole("button", { name: "Save reviewed resolution" }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Corrected destination address" }));
    expect(submit.disabled).toBe(false);
    fireEvent.change(screen.getByLabelText("Decision reason and verification evidence"), { target: { value: "Dispatch confirmed the corrected destination with the receiver." } });
    fireEvent.click(submit);

    await waitFor(() => expect(onResolve).toHaveBeenCalledTimes(1));
    expect(onResolve).toHaveBeenCalledWith("attempt-id", expect.objectContaining({
      resolution: "correct_address",
      correctedAddress: "12 Ring Road, Ibadan",
      correctedLatitude: 7.36,
      correctedLongitude: 3.875,
    }));
  });
});
