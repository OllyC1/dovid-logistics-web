import { applyBasisPoints, assertSafeInteger, ceilDivide, medianKobo, roundUpToIncrement } from "./money";
import type { EligibleCompetitorQuote, FinancialConfig, InternalQuoteBreakdown, PromotionInput, QuoteEngineInput, QuoteEngineResult, RateCardBand } from "./types";

const ZERO_COST_FIELDS = ["expectedFailedDeliveryCost", "expectedReturnDeliveryCost", "routeSpecificOperationalCost"] as const;

export function validateFinancialConfig(config: FinancialConfig) {
  const integerFields = [config.version, config.fleetSize, config.workingDaysPerMonth, config.riderBaseSalaryMonthlyKobo, config.riderMaximumBonusMonthlyKobo, config.fuelPricePerLitreKobo, config.maintenanceReservePerKmKobo, config.depreciationReservePerKmKobo, config.overheadPerBikeMonthlyKobo, config.targetDeliveriesPerBikePerDay, config.targetOperatingMarginBps, config.competitorDiscountTargetBps, config.minimumCustomerFareKobo, config.estimatedEmptyKmPerOrderMilli, config.freeWaitingMinutes, config.waitingBlockMinutes, config.waitingFeePerBlockKobo, config.roundingIncrementKobo, config.expressPremiumBps, config.scheduledPremiumKobo, config.extraStopFeeKobo, config.oversizedHandlingFeeKobo, config.weatherSurchargeBps, config.returnDeliveryBps, config.taxRateBps, config.paymentPercentageFeeBps.online, config.paymentPercentageFeeBps.bank_transfer, config.paymentFixedFeeKobo.online, config.paymentFixedFeeKobo.bank_transfer, config.minimumCompetitorSamples, config.competitorFreshnessDays];
  integerFields.forEach((value, index) => assertSafeInteger(value, `config[${index}]`));
  if (config.motorcycleFuelEfficiencyKmPerLitre <= 0 || config.workingDaysPerMonth <= 0 || config.targetDeliveriesPerBikePerDay <= 0 || config.roundingIncrementKobo <= 0 || config.waitingBlockMinutes <= 0) throw new Error("Invalid financial configuration denominator");
  if (config.targetOperatingMarginBps < 0 || config.targetOperatingMarginBps >= 10_000) throw new Error("Invalid target operating margin");
  if (config.competitorDiscountTargetBps < 0 || config.competitorDiscountTargetBps > 10_000) throw new Error("Invalid competitor discount target");
  if ([config.expressPremiumBps, config.weatherSurchargeBps, config.returnDeliveryBps, config.taxRateBps, config.paymentPercentageFeeBps.online, config.paymentPercentageFeeBps.bank_transfer].some(value => value < 0)) throw new Error("Invalid percentage configuration");
  for (const field of ZERO_COST_FIELDS) {
    const cost = config[field];
    assertSafeInteger(cost.amountKobo, field);
    if (cost.amountKobo === 0 && !cost.justification?.trim()) throw new Error(`${field} requires a zero-value justification`);
  }
}

export function rateCardPrice(distanceMeters: number, bands: RateCardBand[]) {
  assertSafeInteger(distanceMeters, "roadDistanceMeters");
  if (distanceMeters <= 0) throw new Error("Road distance is invalid");
  const band = bands.find((candidate) => distanceMeters >= candidate.minimumDistanceMeters && (candidate.maximumDistanceMeters === null || distanceMeters <= candidate.maximumDistanceMeters));
  if (!band) throw new Error("No approved rate-card band covers this route");
  [band.minimumDistanceMeters, band.priceKobo, band.additionalPerKilometerKobo ?? 0].forEach((value,index)=>assertSafeInteger(value,`rateCardBand[${index}]`));
  if (band.priceKobo < 0 || (band.additionalPerKilometerKobo ?? 0) < 0) throw new Error("Rate-card amounts cannot be negative");
  if (band.maximumDistanceMeters !== null) return band.priceKobo;
  const extraMeters = Math.max(0, distanceMeters - Math.max(0, band.minimumDistanceMeters - 1));
  return band.priceKobo + ceilDivide(extraMeters * (band.additionalPerKilometerKobo ?? 0), 1_000);
}

export function eligibleCompetitorMedian(quotes: EligibleCompetitorQuote[], config: FinancialConfig, now = new Date()) {
  const freshnessStart = now.getTime() - config.competitorFreshnessDays * 86_400_000;
  const eligible = quotes.filter((quote) => quote.verified && quote.comparable && new Date(quote.quotedAt).getTime() >= freshnessStart && (!quote.expiresAt || new Date(quote.expiresAt).getTime() > now.getTime()));
  return eligible.length >= config.minimumCompetitorSamples ? medianKobo(eligible.map((quote) => quote.totalKobo)) : null;
}

function promotionDiscount(priceKobo: number, promotions: PromotionInput[]) {
  const applicable = promotions.length && promotions[0].stackable ? promotions.filter((promotion) => promotion.stackable) : promotions.slice(0, 1);
  return applicable.reduce((total, promotion) => {
    const calculated = promotion.kind === "fixed" ? promotion.value : promotion.kind === "fixed_price" ? Math.max(0, priceKobo - promotion.value) : applyBasisPoints(priceKobo, promotion.value);
    const capped = promotion.maximumDiscountKobo == null ? calculated : Math.min(calculated, promotion.maximumDiscountKobo);
    return total + Math.max(0, capped);
  }, 0);
}

function priceEconomics(customerTotalKobo: number, operationalCostKobo: number, config: FinancialConfig, paymentMethod: QuoteEngineInput["paymentMethod"]) {
  const taxKobo = config.taxTreatment === "none" ? 0 : config.taxTreatment === "exclusive" ? applyBasisPoints(customerTotalKobo, config.taxRateBps) : ceilDivide(customerTotalKobo * config.taxRateBps, 10_000 + config.taxRateBps);
  const grossChargeKobo = config.taxTreatment === "exclusive" ? customerTotalKobo + taxKobo : customerTotalKobo;
  const netRevenueKobo = grossChargeKobo - taxKobo;
  const paymentFeeKobo = applyBasisPoints(grossChargeKobo, config.paymentPercentageFeeBps[paymentMethod]) + config.paymentFixedFeeKobo[paymentMethod];
  const profitKobo = netRevenueKobo - operationalCostKobo - paymentFeeKobo;
  const marginBps = netRevenueKobo > 0 ? Math.floor((profitKobo * 10_000) / netRevenueKobo) : -10_000;
  return { taxKobo, grossChargeKobo, netRevenueKobo, paymentFeeKobo, profitKobo, marginBps };
}

function minimumProfitablePrice(operationalCostKobo: number, config: FinancialConfig, paymentMethod: QuoteEngineInput["paymentMethod"]) {
  if (config.targetOperatingMarginBps + config.paymentPercentageFeeBps[paymentMethod] >= 10_000) throw new Error("Pricing denominator must be positive");
  let low = 0;
  let high = Math.max(config.minimumCustomerFareKobo, operationalCostKobo * 2 + config.paymentFixedFeeKobo[paymentMethod]);
  while (priceEconomics(high, operationalCostKobo, config, paymentMethod).marginBps < config.targetOperatingMarginBps) {
    high *= 2;
    assertSafeInteger(high, "profitability search ceiling");
  }
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (priceEconomics(middle, operationalCostKobo, config, paymentMethod).marginBps >= config.targetOperatingMarginBps) high = middle;
    else low = middle + 1;
  }
  return low;
}

export function calculateDeliveryQuote(input: QuoteEngineInput, config: FinancialConfig, bands: RateCardBand[]): QuoteEngineResult {
  validateFinancialConfig(config);
  [input.roadDistanceMeters, input.pickupDistanceMeters ?? 0, input.repositionDistanceMeters ?? 0, input.additionalStopDistanceMeters ?? 0, input.additionalStops ?? 0, input.waitingMinutes ?? 0, input.packagingCostKobo ?? 0, input.specialHandlingCostKobo ?? 0].forEach((value, index) => assertSafeInteger(value, `input[${index}]`));
  if ([input.pickupDistanceMeters ?? 0, input.repositionDistanceMeters ?? 0, input.additionalStopDistanceMeters ?? 0, input.additionalStops ?? 0, input.waitingMinutes ?? 0, input.packagingCostKobo ?? 0, input.specialHandlingCostKobo ?? 0].some(value=>value<0)) throw new Error("Quote inputs cannot be negative");
  const baseRateKobo = rateCardPrice(input.roadDistanceMeters, bands);
  const waitingBlocks = ceilDivide(Math.max(0, (input.waitingMinutes ?? 0) - config.freeWaitingMinutes), config.waitingBlockMinutes);
  const explicitSurcharges = (input.additionalStops ?? 0) * config.extraStopFeeKobo + waitingBlocks * config.waitingFeePerBlockKobo + (input.serviceLevel === "scheduled" ? config.scheduledPremiumKobo : 0) + (input.oversized ? config.oversizedHandlingFeeKobo : 0);
  const serviceSurcharge = input.serviceLevel === "express" ? applyBasisPoints(baseRateKobo + explicitSurcharges, config.expressPremiumBps) : 0;
  const weatherSurcharge = input.weatherSurchargeActive ? applyBasisPoints(baseRateKobo + explicitSurcharges + serviceSurcharge, config.weatherSurchargeBps) : 0;
  const returnSurcharge = input.returnDelivery ? applyBasisPoints(baseRateKobo + explicitSurcharges + serviceSurcharge + weatherSurcharge, config.returnDeliveryBps) : 0;
  const surchargeTotalKobo = explicitSurcharges + serviceSurcharge + weatherSurcharge + returnSurcharge;
  const rateCardTotalKobo = baseRateKobo + surchargeTotalKobo;

  const totalOperationalDistanceMeters = input.roadDistanceMeters + (input.pickupDistanceMeters ?? 0) + (input.repositionDistanceMeters ?? config.estimatedEmptyKmPerOrderMilli) + (input.additionalStopDistanceMeters ?? 0);
  const fuelPerKmKobo = ceilDivide(config.fuelPricePerLitreKobo, config.motorcycleFuelEfficiencyKmPerLitre);
  const variablePerKmKobo = fuelPerKmKobo + config.maintenanceReservePerKmKobo + config.depreciationReservePerKmKobo;
  const variableCostKobo = ceilDivide(totalOperationalDistanceMeters * variablePerKmKobo, 1_000);
  const monthlyDeliveriesPerBike = config.targetDeliveriesPerBikePerDay * config.workingDaysPerMonth;
  const fixedCostPerOrderKobo = ceilDivide(config.riderBaseSalaryMonthlyKobo + config.riderMaximumBonusMonthlyKobo + config.overheadPerBikeMonthlyKobo, monthlyDeliveriesPerBike);
  const operationalCostKobo = variableCostKobo + fixedCostPerOrderKobo + config.expectedFailedDeliveryCost.amountKobo + config.expectedReturnDeliveryCost.amountKobo + config.routeSpecificOperationalCost.amountKobo + (input.packagingCostKobo ?? 0) + (input.specialHandlingCostKobo ?? 0);
  const profitableFloorKobo = minimumProfitablePrice(operationalCostKobo, config, input.paymentMethod);

  const competitorMedianKobo = eligibleCompetitorMedian(input.competitorQuotes ?? [], config, input.now);
  const competitorTargetKobo = competitorMedianKobo === null ? null : competitorMedianKobo - applyBasisPoints(competitorMedianKobo, config.competitorDiscountTargetBps);
  const candidatePriceKobo = competitorTargetKobo ?? rateCardTotalKobo;
  const discountKobo = promotionDiscount(candidatePriceKobo, input.promotions ?? []);
  const discountedCandidateKobo = Math.max(0, candidatePriceKobo - discountKobo);
  const approvedFloorOverride = Boolean(input.promotions?.some((promotion) => promotion.allowBelowProfitabilityFloor));
  const preRoundedKobo = approvedFloorOverride ? discountedCandidateKobo : Math.max(discountedCandidateKobo, profitableFloorKobo, config.minimumCustomerFareKobo);
  const customerBaseKobo = roundUpToIncrement(preRoundedKobo, config.roundingIncrementKobo);
  const economics = priceEconomics(customerBaseKobo, operationalCostKobo, config, input.paymentMethod);
  const flags: string[] = [];
  if (competitorTargetKobo !== null && customerBaseKobo > competitorTargetKobo) flags.push("MARKET_TARGET_NOT_MET");
  if (approvedFloorOverride && discountKobo > 0 && discountedCandidateKobo < Math.max(profitableFloorKobo, config.minimumCustomerFareKobo)) flags.push("APPROVED_PROMOTION_BELOW_MARGIN_FLOOR");
  if (!approvedFloorOverride && discountKobo > 0 && customerBaseKobo > discountedCandidateKobo) flags.push("DISCOUNT_LIMITED_BY_MARGIN_FLOOR");
  const pricingReason: InternalQuoteBreakdown["pricingReason"] = approvedFloorOverride ? "APPROVED_PROMOTION" : customerBaseKobo >= profitableFloorKobo && profitableFloorKobo > discountedCandidateKobo ? "PROFITABILITY_FLOOR" : competitorTargetKobo !== null ? "VERIFIED_MARKET_TARGET" : "RATE_CARD";
  const includedCharges = [{ label: "Delivery service", amountKobo: baseRateKobo }];
  if (surchargeTotalKobo) includedCharges.push({ label: "Selected service additions", amountKobo: surchargeTotalKobo });
  if (discountKobo > 0) includedCharges.push({ label: "Promotion", amountKobo: -Math.min(discountKobo, candidatePriceKobo) });
  if (config.taxTreatment === "exclusive" && economics.taxKobo) includedCharges.push({ label: "Applicable tax", amountKobo: economics.taxKobo });
  return {
    currency: "NGN",
    customerTotalKobo: economics.grossChargeKobo,
    expiresAt: new Date((input.now ?? new Date()).getTime() + 10 * 60_000).toISOString(),
    configVersion: config.version,
    includedCharges,
    internal: { rateCardPriceKobo: rateCardTotalKobo, competitorMedianKobo, competitorTargetKobo, candidatePriceKobo, operationalCostKobo, minimumProfitableCustomerTotalKobo: profitableFloorKobo, surchargeTotalKobo, promotionDiscountKobo: discountKobo, taxKobo: economics.taxKobo, paymentProcessingFeeKobo: economics.paymentFeeKobo, estimatedProfitKobo: economics.profitKobo, estimatedOperatingMarginBps: economics.marginBps, totalOperationalDistanceMeters, pricingReason, flags }
  };
}
