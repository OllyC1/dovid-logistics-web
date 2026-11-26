// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { RunOperationsConsole } from "@/components/admin/run-operations-console";

afterEach(cleanup);

describe("RunOperationsConsole fleet readiness", () => {
  it("explains and disables a motorcycle without verified measured capacity", () => {
    render(<RunOperationsConsole
      vehicles={[{
        id: "vehicle-1",
        code: "BIKE-01",
        registration_number: "ABC 123 XY",
        operational_status: "available",
        assigned_rider_id: "rider-1",
        safety_status: "cleared",
        capacity_verified_at: null,
      }]}
      riders={[{ id: "rider-1", full_name: "Test Rider" }]}
      runs={[]}
      orders={[]}
      expenses={[]}
      attempts={[]}
    />);

    expect((screen.getByRole("option", { name: /capacity check needed/i }) as HTMLOptionElement).disabled).toBe(true);
    expect(screen.getByText(/no bike is ready for a run/i)).toBeTruthy();
    expect((screen.getByRole("button", { name: "Create planned run" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
