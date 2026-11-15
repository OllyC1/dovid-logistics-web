export type PricingRule = { baseFeeMinor: number; includedDistanceMeters: number; perKilometerMinor: number; minimumFeeMinor: number; sizeSurchargeMinor?: number; currency: string };

export function calculateQuote(rule: PricingRule, distanceMeters: number) {
  if (!Number.isFinite(distanceMeters) || distanceMeters < 0) throw new Error("Invalid route distance");
  const additionalMeters = Math.max(0, distanceMeters - rule.includedDistanceMeters);
  const distanceFee = Math.ceil(additionalMeters / 1000) * rule.perKilometerMinor;
  const subtotal = rule.baseFeeMinor + distanceFee + (rule.sizeSurchargeMinor ?? 0);
  return { baseFeeMinor: rule.baseFeeMinor, distanceFeeMinor: distanceFee, sizeSurchargeMinor: rule.sizeSurchargeMinor ?? 0, totalMinor: Math.max(subtotal, rule.minimumFeeMinor), currency: rule.currency };
}
