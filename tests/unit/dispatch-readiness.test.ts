import { describe, expect, it } from "vitest";
import { assessDispatchReadiness } from "@/features/dispatch/readiness";

const verifiedVehicle = {
  id: "vehicle-1",
  registration_number: "ABC 123 XY",
  operational_status: "available",
  safety_status: "cleared",
  assigned_rider_id: "rider-1",
  max_active_assignments: 10,
  capacity_verified_at: "2026-11-26T10:00:00.000Z",
};

describe("assessDispatchReadiness", () => {
  it("does not treat placeholder fleet records as booking capacity", () => {
    const readiness = assessDispatchReadiness({
      vehicles: [{ ...verifiedVehicle, registration_number: "PENDING-BIKE-01", operational_status: "offline" }],
      activeNamedRiderIds: ["rider-1"],
      activeAssignments: [],
      riderParcelLimit: 10,
      handoverBufferMinutes: null,
      safeCompletionBufferMinutes: null,
    });

    expect(readiness).toMatchObject({
      readyMotorcycles: 0,
      availableParcelSlots: 0,
      automaticCapacityAvailable: false,
      scheduleBuffersConfigured: false,
    });
  });

  it("reports remaining slots using the lower rider and motorcycle limits", () => {
    const readiness = assessDispatchReadiness({
      vehicles: [verifiedVehicle],
      activeNamedRiderIds: ["rider-1"],
      activeAssignments: Array.from({ length: 9 }, () => ({ vehicle_id: "vehicle-1", rider_id: "rider-1" })),
      riderParcelLimit: 10,
      handoverBufferMinutes: 15,
      safeCompletionBufferMinutes: 20,
    });

    expect(readiness).toMatchObject({
      activeNamedRiders: 1,
      readyMotorcycles: 1,
      availableParcelSlots: 1,
      automaticCapacityAvailable: true,
      scheduleBuffersConfigured: true,
    });
  });

  it("requires an active named rider even when the motorcycle looks ready", () => {
    const readiness = assessDispatchReadiness({
      vehicles: [verifiedVehicle],
      activeNamedRiderIds: [],
      activeAssignments: [],
      riderParcelLimit: 10,
      handoverBufferMinutes: 15,
      safeCompletionBufferMinutes: 20,
    });

    expect(readiness.readyMotorcycles).toBe(0);
    expect(readiness.availableParcelSlots).toBe(0);
  });
});
