import { describe, expect, it } from "vitest";
import { remainingDispatchSlots } from "@/features/dispatch/capacity";

describe("remainingDispatchSlots", () => {
  it("allows the tenth parcel when the verified limit is ten and nine are active", () => {
    expect(remainingDispatchSlots({ vehicleCapacity: 10, riderCapacity: 10, vehicleWorkload: 9, riderWorkload: 9 })).toBe(1);
  });

  it("blocks work when either the rider or motorcycle has reached its lower limit", () => {
    expect(remainingDispatchSlots({ vehicleCapacity: 10, riderCapacity: 10, vehicleWorkload: 10, riderWorkload: 9 })).toBe(0);
    expect(remainingDispatchSlots({ vehicleCapacity: 10, riderCapacity: 5, vehicleWorkload: 4, riderWorkload: 5 })).toBe(0);
  });
});
