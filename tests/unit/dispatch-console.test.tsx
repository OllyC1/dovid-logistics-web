// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { DispatchConsole } from "@/components/admin/dispatch-console";

afterEach(cleanup);

describe("DispatchConsole readiness", () => {
  it("explains why automatic capacity is unavailable and links to each corrective workflow", () => {
    render(<DispatchConsole
      vehicles={[]}
      riders={[]}
      missingRiderNames={0}
      requests={[]}
      orders={[]}
      readiness={{
        activeNamedRiders: 0,
        readyMotorcycles: 0,
        totalMotorcycles: 2,
        availableParcelSlots: 0,
        riderParcelLimit: 10,
        scheduleBuffersConfigured: false,
        automaticCapacityAvailable: false,
      }}
    />);

    expect(screen.getByRole("heading", { name: "Automatic capacity is not ready" })).toBeTruthy();
    expect(screen.getByText(/no verified motorcycle and active rider have a free parcel slot/i)).toBeTruthy();
    expect(screen.getByText("Ready motorcycles").parentElement?.textContent).toContain("0 / 2");
    expect(screen.getByText(/set the handover and completion buffers/i)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Review motorcycles" }).getAttribute("href")).toBe("#fleet-registry");
    expect(screen.getByRole("link", { name: "Manage riders" }).getAttribute("href")).toBe("/admin/team");
    expect(screen.getByRole("link", { name: "Set operating rules" }).getAttribute("href")).toBe("/admin/coverage");
  });
});
