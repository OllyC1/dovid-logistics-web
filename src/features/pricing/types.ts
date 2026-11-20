export type MoneyKobo = number;
export type ServiceLevel = "standard" | "express" | "scheduled";
export type PaymentRail = "online" | "bank_transfer";
export type TaxTreatment = "none" | "inclusive" | "exclusive";

export type CostInput = {
  amountKobo: MoneyKobo;
  justification?: string;
};

export type FinancialConfig = {
  version: number;
  currency: "NGN";
  timezone: "Africa/Lagos";
  fleetSize: number;
  workingDaysPerMonth: number;
  riderBaseSalaryMonthlyKobo: MoneyKobo;
  riderMaximumBonusMonthlyKobo: MoneyKobo;
  fuelPricePerLitreKobo: MoneyKobo;
  motorcycleFuelEfficiencyKmPerLitre: number;
  maintenanceReservePerKmKobo: MoneyKobo;
  depreciationReservePerKmKobo: MoneyKobo;
  overheadPerBikeMonthlyKobo: MoneyKobo;
  targetDeliveriesPerBikePerDay: number;
  targetOperatingMarginBps: number;
  competitorDiscountTargetBps: number;
  minimumCustomerFareKobo: MoneyKobo;
  estimatedEmptyKmPerOrderMilli: number;
  freeWaitingMinutes: number;
  waitingBlockMinutes: number;
  waitingFeePerBlockKobo: MoneyKobo;
  roundingIncrementKobo: MoneyKobo;
  expressPremiumBps: number;
  scheduledPremiumKobo: MoneyKobo;
  extraStopFeeKobo: MoneyKobo;
  oversizedHandlingFeeKobo: MoneyKobo;
  weatherSurchargeBps: number;
  returnDeliveryBps: number;
  taxRateBps: number;
  taxTreatment: TaxTreatment;
  paymentPercentageFeeBps: Record<PaymentRail, number>;
  paymentFixedFeeKobo: Record<PaymentRail, MoneyKobo>;
  expectedFailedDeliveryCost: CostInput;
  expectedReturnDeliveryCost: CostInput;
  routeSpecificOperationalCost: CostInput;
  minimumCompetitorSamples: number;
  competitorFreshnessDays: number;
};

export type RateCardBand = {
  minimumDistanceMeters: number;
  maximumDistanceMeters: number | null;
  priceKobo: MoneyKobo;
  additionalPerKilometerKobo?: MoneyKobo;
};

export type EligibleCompetitorQuote = {
  id: string;
  totalKobo: MoneyKobo;
  quotedAt: string;
  expiresAt?: string | null;
  verified: boolean;
  comparable: boolean;
};

export type PromotionInput = {
  code: string;
  kind: "fixed" | "percentage" | "fixed_price";
  value: number;
  maximumDiscountKobo?: MoneyKobo | null;
  stackable: boolean;
  autoApply?: boolean;
  allowBelowProfitabilityFloor?: boolean;
};

export type QuoteEngineInput = {
  roadDistanceMeters: number;
  pickupDistanceMeters?: number;
  repositionDistanceMeters?: number;
  additionalStopDistanceMeters?: number;
  additionalStops?: number;
  waitingMinutes?: number;
  serviceLevel: ServiceLevel;
  paymentMethod: PaymentRail;
  oversized?: boolean;
  weatherSurchargeActive?: boolean;
  returnDelivery?: boolean;
  packagingCostKobo?: MoneyKobo;
  specialHandlingCostKobo?: MoneyKobo;
  promotions?: PromotionInput[];
  competitorQuotes?: EligibleCompetitorQuote[];
  now?: Date;
};

export type InternalQuoteBreakdown = {
  rateCardPriceKobo: MoneyKobo;
  competitorMedianKobo: MoneyKobo | null;
  competitorTargetKobo: MoneyKobo | null;
  candidatePriceKobo: MoneyKobo;
  operationalCostKobo: MoneyKobo;
  minimumProfitableCustomerTotalKobo: MoneyKobo;
  surchargeTotalKobo: MoneyKobo;
  promotionDiscountKobo: MoneyKobo;
  taxKobo: MoneyKobo;
  paymentProcessingFeeKobo: MoneyKobo;
  estimatedProfitKobo: MoneyKobo;
  estimatedOperatingMarginBps: number;
  totalOperationalDistanceMeters: number;
  pricingReason: "RATE_CARD" | "VERIFIED_MARKET_TARGET" | "PROFITABILITY_FLOOR" | "APPROVED_PROMOTION";
  flags: string[];
};

export type QuoteEngineResult = {
  currency: "NGN";
  customerTotalKobo: MoneyKobo;
  expiresAt: string;
  configVersion: number;
  includedCharges: Array<{ label: string; amountKobo: MoneyKobo }>;
  internal: InternalQuoteBreakdown;
};
