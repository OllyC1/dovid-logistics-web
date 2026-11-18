// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RiderStatusControls } from "@/components/rider/status-controls";

const navigation = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => navigation }));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  navigation.refresh.mockReset();
});

describe("RiderStatusControls", () => {
  it("shows the next mobile action immediately after the server accepts a transition", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: "rider_en_route_to_pickup" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })));

    render(<RiderStatusControls orderId="order-1" currentStatus="assigned" paymentStatus="paid" />);
    fireEvent.click(screen.getByRole("button", { name: "Start pickup journey" }));

    expect(await screen.findByRole("button", { name: "Confirm pickup" })).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain("Pickup journey started");
    await waitFor(() => expect(navigation.refresh).toHaveBeenCalledOnce());
  });
});
