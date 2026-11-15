import { describe, expect, it } from "vitest";
import { evaluateBookingEligibility, isWithinServiceHours } from "@/features/service-areas/eligibility";

const input = (overrides: Partial<Parameters<typeof evaluateBookingEligibility>[0]> = {}): Parameters<typeof evaluateBookingEligibility>[0] => ({ pickupCovered: true, deliveryCovered: true, allStopsCovered: true, zonesAllowBooking: true, zoneRequiresApproval: false, roadDistanceMeters: 8_000, standardMaxDistanceMeters: 12_000, manualMaxDistanceMeters: 22_000, withinServiceHours: true, availableFleetSlots: 1, packageSize: "small", standardPackageSizes: ["small", "medium"], oversized: false, oversizedRequiresApproval: true, estimatedProfitKobo: 50_000, ...overrides });

describe("booking eligibility", () => {
  it("allows a feasible profitable route without promising a rider", () => expect(evaluateBookingEligibility(input())).toMatchObject({ decision: "standard_eligible", message: "Great! We can check delivery availability for this route." }));
  it("requires dispatch approval above 12km through 22km", () => {
    expect(evaluateBookingEligibility(input({ roadDistanceMeters: 12_001 })).decision).toBe("manual_approval");
    expect(evaluateBookingEligibility(input({ roadDistanceMeters: 22_000 })).decision).toBe("manual_approval");
  });
  it("requires a manual quote above 22km", () => expect(evaluateBookingEligibility(input({ roadDistanceMeters: 22_001 })).decision).toBe("manual_quote"));
  it("blocks inactive coverage, unavailable capacity and unprofitable work", () => {
    expect(evaluateBookingEligibility(input({ zonesAllowBooking: false })).decision).toBe("unsupported");
    expect(evaluateBookingEligibility(input({ availableFleetSlots: 0 }))).toMatchObject({ decision: "capacity_unavailable", message: "All riders are currently busy. Please try another time." });
    expect(evaluateBookingEligibility(input({ estimatedProfitKobo: -1 })).reasonCode).toBe("profitability_floor_not_met");
  });
  it("sends large or oversized motorcycle work for review", () => {
    expect(evaluateBookingEligibility(input({ packageSize: "large" })).decision).toBe("manual_approval");
    expect(evaluateBookingEligibility(input({ oversized: true })).decision).toBe("manual_approval");
  });
  it("uses Africa/Lagos service hours", () => {
    const hours = { timezone: "Africa/Lagos", monday: ["07:00", "20:00"] as [string, string], tuesday: null, wednesday: null, thursday: null, friday: null, saturday: null, sunday: null };
    expect(isWithinServiceHours(new Date("2026-11-16T10:00:00Z"), hours)).toBe(true);
    expect(isWithinServiceHours(new Date("2026-11-16T22:00:00Z"), hours)).toBe(false);
  });
});
