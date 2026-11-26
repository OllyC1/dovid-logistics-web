import { describe, expect, it } from "vitest";
import { assessDispatchReadiness, calculateDispatchCapacity } from "@/features/dispatch/readiness";

const verifiedVehicle = {
  id: "vehicle-1",
  registration_number: "ABC 123 XY",
  registration_verified_at: "2026-11-26T09:00:00.000Z",
  manufacturer: "Honda",
  model: "Ace 125",
  model_year: 2025,
  operational_status: "available",
  safety_status: "cleared",
  assigned_rider_id: "rider-1",
  max_active_assignments: 10,
  capacity_verified_at: "2026-11-26T10:00:00.000Z",
};

describe("assessDispatchReadiness", () => {
  it("never counts an unverified motorcycle for public or assisted booking capacity", () => {
    expect(calculateDispatchCapacity({
      vehicles: [{ ...verifiedVehicle, capacity_verified_at: null }],
      activeNamedRiderIds: ["rider-1"],
      activeAssignments: [],
      riderParcelLimit: 10,
    })).toEqual({ readyMotorcycles: 0, availableParcelSlots: 0 });
  });

  it("does not mistake a plausible test plate for verified registration evidence", () => {
    expect(calculateDispatchCapacity({
      vehicles: [{ ...verifiedVehicle, registration_verified_at: null }],
      activeNamedRiderIds: ["rider-1"],
      activeAssignments: [],
      riderParcelLimit: 10,
    })).toEqual({ readyMotorcycles: 0, availableParcelSlots: 0 });
  });

  it("does not treat placeholder fleet records as booking capacity", () => {
    const readiness = assessDispatchReadiness({
      vehicles: [{ ...verifiedVehicle, registration_number: "PENDING-BIKE-01", operational_status: "offline" }],
      activeNamedRiderIds: ["rider-1"],
      activeAssignments: [],
      riderParcelLimit: 10,
      handoverBufferMinutes: null,
      safeCompletionBufferMinutes: null,
      maximumContinuousRidingMinutes: null,
      minimumBreakMinutes: null,
    });

    expect(readiness).toMatchObject({
      readyMotorcycles: 0,
      availableParcelSlots: 0,
      automaticCapacityAvailable: false,
      scheduleBuffersConfigured: false,
      riderRestRulesConfigured: false,
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
      maximumContinuousRidingMinutes: 180,
      minimumBreakMinutes: 20,
    });

    expect(readiness).toMatchObject({
      activeNamedRiders: 1,
      readyMotorcycles: 1,
      availableParcelSlots: 1,
      automaticCapacityAvailable: true,
      scheduleBuffersConfigured: true,
      riderRestRulesConfigured: true,
    });
  });

  it("does not advertise automatic booking while safety buffers are unset", () => {
    const readiness = assessDispatchReadiness({
      vehicles: [verifiedVehicle],
      activeNamedRiderIds: ["rider-1"],
      activeAssignments: [],
      riderParcelLimit: 10,
      handoverBufferMinutes: null,
      safeCompletionBufferMinutes: null,
      maximumContinuousRidingMinutes: 180,
      minimumBreakMinutes: 20,
    });

    expect(readiness.availableParcelSlots).toBe(10);
    expect(readiness.scheduleBuffersConfigured).toBe(false);
    expect(readiness.riderRestRulesConfigured).toBe(true);
    expect(readiness.automaticCapacityAvailable).toBe(false);
  });

  it("does not advertise automatic booking while rider rest rules are unset", () => {
    const readiness = assessDispatchReadiness({
      vehicles: [verifiedVehicle],
      activeNamedRiderIds: ["rider-1"],
      activeAssignments: [],
      riderParcelLimit: 10,
      handoverBufferMinutes: 15,
      safeCompletionBufferMinutes: 20,
      maximumContinuousRidingMinutes: null,
      minimumBreakMinutes: null,
    });

    expect(readiness.availableParcelSlots).toBe(10);
    expect(readiness.scheduleBuffersConfigured).toBe(true);
    expect(readiness.riderRestRulesConfigured).toBe(false);
    expect(readiness.automaticCapacityAvailable).toBe(false);
  });

  it("requires an active named rider even when the motorcycle looks ready", () => {
    const readiness = assessDispatchReadiness({
      vehicles: [verifiedVehicle],
      activeNamedRiderIds: [],
      activeAssignments: [],
      riderParcelLimit: 10,
      handoverBufferMinutes: 15,
      safeCompletionBufferMinutes: 20,
      maximumContinuousRidingMinutes: 180,
      minimumBreakMinutes: 20,
    });

    expect(readiness.readyMotorcycles).toBe(0);
    expect(readiness.availableParcelSlots).toBe(0);
  });
});
