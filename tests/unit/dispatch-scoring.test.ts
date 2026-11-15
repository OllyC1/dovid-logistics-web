import { describe, expect, it } from "vitest";
import { rankDispatchCandidates, scoreDispatchCandidate } from "@/features/dispatch/scoring";

const candidate = (overrides: Partial<Parameters<typeof scoreDispatchCandidate>[0]> = {}) => ({ riderId: "rider-1", vehicleId: "bike-1", proximityMeters: 1_000, activeAssignments: 0, capacity: 1, routeDurationSeconds: 1_200, available: true, safetyCleared: true, homeTerritoryMatch: true, ...overrides });

describe("dispatch scoring", () => {
  it("prefers proximity and lighter workload", () => {
    const ranked = rankDispatchCandidates([candidate({ riderId: "far", proximityMeters: 3_500, homeTerritoryMatch: false }), candidate({ riderId: "near", proximityMeters: 500 })]);
    expect(ranked[0].riderId).toBe("near");
  });
  it("treats home territory as a preference, not a restriction", () => expect(scoreDispatchCandidate(candidate({ homeTerritoryMatch: false })).eligible).toBe(true));
  it("rejects capacity and safety conflicts", () => {
    expect(scoreDispatchCandidate(candidate({ activeAssignments: 1 })).eligible).toBe(false);
    expect(scoreDispatchCandidate(candidate({ safetyCleared: false })).eligible).toBe(false);
    expect(scoreDispatchCandidate(candidate({ available: false })).eligible).toBe(false);
  });
});
