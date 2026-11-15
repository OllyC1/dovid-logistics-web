import { describe, expect, it } from "vitest";
import { evaluateRunFeasibility } from "@/features/dispatch/run-feasibility";

const parcel = { orderId: "one", weightGrams: 2_000, volumeMm3: 1_000_000, compatibilityTags: [], pickupSequence: 1, dropoffSequence: 2, deadlineAt: null, estimatedDropoffAt: null };
describe("multi-parcel run feasibility", () => {
  it("allows multiple distinct orders within verified capacity", () => {
    const result = evaluateRunFeasibility({ parcels: [parcel, { ...parcel, orderId: "two", pickupSequence: 2, dropoffSequence: 4 }], maxAssignments: 3, capacityVerified: true, maxPayloadWeightGrams: 5_000, maxCargoVolumeMm3: 3_000_000 });
    expect(result.feasible).toBe(true);
  });
  it("rejects unverified multi-parcel capacity and overweight loads", () => {
    const result = evaluateRunFeasibility({ parcels: [parcel, { ...parcel, orderId: "two" }], maxAssignments: 3, capacityVerified: false, maxPayloadWeightGrams: 3_000, maxCargoVolumeMm3: null });
    expect(result.issues).toEqual(expect.arrayContaining(["vehicle_capacity_not_verified", "payload_weight_exceeded"]));
  });
  it("enforces pickup before each corresponding drop-off", () => {
    expect(evaluateRunFeasibility({ parcels: [{ ...parcel, pickupSequence: 3, dropoffSequence: 2 }], maxAssignments: 2, capacityVerified: true, maxPayloadWeightGrams: 5_000, maxCargoVolumeMm3: null }).issues).toContain("pickup_must_precede_dropoff");
  });
});

