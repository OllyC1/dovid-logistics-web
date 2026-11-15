import { applyBasisPoints, assertSafeInteger } from "@/features/pricing/money";

export type RiderPerformanceScores = {
  productivityBps: number;
  onTimeBps: number;
  customerSatisfactionBps: number;
  safetyAndHandlingBps: number;
  attendanceBps: number;
};

export const DEFAULT_BONUS_WEIGHTS_KOBO = {
  productivity: 1_000_000,
  onTime: 750_000,
  customerSatisfaction: 500_000,
  safetyAndHandling: 500_000,
  attendance: 250_000
} as const;

export function calculateProjectedRiderBonus(scores: RiderPerformanceScores, weights = DEFAULT_BONUS_WEIGHTS_KOBO) {
  Object.values(scores).forEach((score) => { assertSafeInteger(score, "performance score"); if (score < 0 || score > 10_000) throw new Error("Performance scores must be between 0 and 10,000 basis points"); });
  const breakdown = {
    productivityKobo: applyBasisPoints(weights.productivity, scores.productivityBps),
    onTimeKobo: applyBasisPoints(weights.onTime, scores.onTimeBps),
    customerSatisfactionKobo: applyBasisPoints(weights.customerSatisfaction, scores.customerSatisfactionBps),
    safetyAndHandlingKobo: applyBasisPoints(weights.safetyAndHandling, scores.safetyAndHandlingBps),
    attendanceKobo: applyBasisPoints(weights.attendance, scores.attendanceBps)
  };
  return { totalKobo: Object.values(breakdown).reduce((sum, amount) => sum + amount, 0), breakdown };
}
