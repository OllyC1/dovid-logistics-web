// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DeliveryOperationsForms } from "@/components/rider/delivery-operations-forms";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

afterEach(cleanup);

describe("DeliveryOperationsForms", () => {
  it("keeps normal delivery controls available before a return is authorized", () => {
    render(<DeliveryOperationsForms orderId="order-1" runId="run-1" deliveryStatus="in_transit" activeWaitingSession={null} />);

    expect(screen.getByText("Request an additional cost")).toBeTruthy();
    expect(screen.getByText("Could not deliver this parcel")).toBeTruthy();
    expect(screen.queryByText("Waiting time", { selector: "p" })).toBeNull();
  });

  it("removes receiver-only actions while a parcel is returning to its sender", () => {
    render(<DeliveryOperationsForms orderId="order-1" runId="run-1" deliveryStatus="delivery_failed" activeWaitingSession={null} returnInProgress />);

    expect(screen.getByText("Request an additional cost")).toBeTruthy();
    expect(screen.queryByText("Could not deliver this parcel")).toBeNull();
    expect(screen.queryByText("Waiting time", { selector: "p" })).toBeNull();
    expect(screen.getByRole("option", { name: "Return journey" })).toBeTruthy();
  });

  it("shows the automatic free-wait countdown after arrival", () => {
    render(<DeliveryOperationsForms orderId="order-1" runId="run-1" deliveryStatus="arrived_at_destination" activeWaitingSession={{ id: "wait-1", startedAt: new Date().toISOString(), freeMinutes: 10 }} />);

    expect(screen.getByText("Waiting time")).toBeTruthy();
    expect(screen.getByText(/of free waiting time remains/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Stop waiting timer" })).toBeTruthy();
  });
});
