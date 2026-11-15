export type DispatchCandidate = {
  riderId: string;
  vehicleId: string;
  proximityMeters: number | null;
  activeAssignments: number;
  capacity: number;
  routeDurationSeconds: number;
  available: boolean;
  safetyCleared: boolean;
  homeTerritoryMatch: boolean;
};

export function scoreDispatchCandidate(candidate: DispatchCandidate) {
  if (!candidate.available || !candidate.safetyCleared || candidate.activeAssignments >= candidate.capacity) return { eligible: false, score: Number.NEGATIVE_INFINITY, reasons: ["capacity_or_safety_unavailable"] };
  const proximity = candidate.proximityMeters === null ? 0 : Math.max(0, 4000 - Math.min(candidate.proximityMeters, 4000)) / 40;
  const workload = Math.max(0, candidate.capacity - candidate.activeAssignments) * 100;
  const duration = Math.max(0, 3600 - Math.min(candidate.routeDurationSeconds, 3600)) / 60;
  const territoryPreference = candidate.homeTerritoryMatch ? 25 : 0;
  return {
    eligible: true,
    score: Math.round((proximity + workload + duration + territoryPreference) * 100) / 100,
    reasons: ["proximity", "workload", "route_duration", ...(candidate.homeTerritoryMatch ? ["home_territory_preference"] : [])]
  };
}

export function rankDispatchCandidates(candidates: DispatchCandidate[]) {
  return candidates.map((candidate) => ({ ...candidate, ...scoreDispatchCandidate(candidate) })).filter((candidate) => candidate.eligible).sort((left, right) => right.score - left.score);
}
