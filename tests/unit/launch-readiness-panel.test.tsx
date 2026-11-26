// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { LaunchReadinessPanel } from "@/components/admin/launch-readiness-panel";

afterEach(cleanup);

describe("LaunchReadinessPanel", () => {
  it("shows blockers and preserves disabled launch controls without claiming field approval", () => {
    render(<LaunchReadinessPanel
      dispatch={{ activeNamedRiders: 1, readyMotorcycles: 0, totalMotorcycles: 2, availableParcelSlots: 0, riderParcelLimit: 10, scheduleBuffersConfigured: true, riderRestRulesConfigured: false, automaticCapacityAvailable: false }}
      activeApprovedZones={7}
      activeRateCards={1}
      publicBookingsEnabled
      livePaymentsEnabled={false}
      assistedBookingsEnabled={false}
    />);

    expect(screen.getByRole("heading", { name: "Not ready for real deliveries" })).toBeTruthy();
    expect(screen.getByText("0 free slots")).toBeTruthy();
    expect(screen.getByText(/Road and address field confirmation remains a separate founder check/)).toBeTruthy();
    expect(screen.getByText(/Live Paystack:/).parentElement?.textContent).toContain("disabled");
    expect(screen.getByText(/Assisted confirmation:/).parentElement?.textContent).toContain("disabled");
    const schedulingGate = screen.getByText("Safe scheduling").closest("article");
    expect(schedulingGate).toBeTruthy();
    expect(within(schedulingGate!).getByText("Not configured")).toBeTruthy();
    expect(within(schedulingGate!).getByText(/maximum continuous riding and minimum break/i)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Prepare motorcycles" }).getAttribute("href")).toBe("/admin/dispatch");
  });
});
