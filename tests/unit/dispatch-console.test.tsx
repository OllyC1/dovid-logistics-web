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
        riderRestRulesConfigured: false,
        automaticCapacityAvailable: false,
      }}
    />);

    expect(screen.getByRole("heading", { name: "Automatic capacity is not ready" })).toBeTruthy();
    expect(screen.getByText(/no verified motorcycle and active rider have a free parcel slot/i)).toBeTruthy();
    expect(screen.getByText("Ready motorcycles").parentElement?.textContent).toContain("0 / 2");
    expect(screen.getByText(/set the pickup handover and end-of-day safety allowances/i)).toBeTruthy();
    expect(screen.getByText(/set the maximum riding and minimum break times/i)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Review motorcycles" }).getAttribute("href")).toBe("#fleet-registry");
    expect(screen.getByRole("link", { name: "Manage riders" }).getAttribute("href")).toBe("/admin/team");
    expect(screen.getByRole("link", { name: "Set operating rules" }).getAttribute("href")).toBe("/admin/coverage");
  });

  it("disables assignment controls for a bike whose measured capacity is not verified", () => {
    render(<DispatchConsole
      vehicles={[{
        id: "vehicle-1",
        code: "BIKE-01",
        registration_number: "ABC 123 XY",
        manufacturer: "Honda",
        model: "Ace",
        model_year: 2025,
        operational_status: "available",
        safety_status: "cleared",
        assigned_rider_id: "rider-1",
        home_territory_codes: [],
        max_active_assignments: 10,
        max_payload_weight_grams: 20_000,
        cargo_length_mm: 500,
        cargo_width_mm: 400,
        cargo_height_mm: 400,
        capacity_verified_at: null,
      }]}
      riders={[{ id: "rider-1", full_name: "Test Rider" }]}
      missingRiderNames={0}
      requests={[]}
      orders={[{ id: "order-1", order_reference: "DOV-001", pickup_address: "Bodija", delivery_address: "Dugbe", pickup_zone_id: null }]}
      readiness={{ activeNamedRiders: 1, readyMotorcycles: 0, totalMotorcycles: 1, availableParcelSlots: 0, riderParcelLimit: 10, scheduleBuffersConfigured: true, riderRestRulesConfigured: true, automaticCapacityAvailable: false }}
    />);

    expect((screen.getByRole("option", { name: /capacity check needed/i }) as HTMLOptionElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Check remaining capacity and assign" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
