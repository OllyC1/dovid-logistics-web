import { describe,expect,it } from "vitest";
import { DEFAULT_FINANCIAL_CONFIG,PROVISIONAL_RATE_CARD } from "@/features/pricing/defaults";
import { calculateDeliveryQuote,eligibleCompetitorMedian,rateCardPrice } from "@/features/pricing/engine";
import type { FinancialConfig,QuoteEngineInput } from "@/features/pricing/types";

const input:QuoteEngineInput={roadDistanceMeters:3000,serviceLevel:"standard",paymentMethod:"online"};
const config=():FinancialConfig=>structuredClone(DEFAULT_FINANCIAL_CONFIG);
const quote=(overrides:Partial<QuoteEngineInput>={},cfg=config())=>calculateDeliveryQuote({...input,...overrides},cfg,PROVISIONAL_RATE_CARD);

describe("provisional distance bands",()=>{
  it("prices a delivery inside the first band",()=>expect(rateCardPrice(2500,PROVISIONAL_RATE_CARD)).toBe(180000));
  it("prices exactly 3km in the first band",()=>expect(rateCardPrice(3000,PROVISIONAL_RATE_CARD)).toBe(180000));
  it("prices one metre above 3km in the second band",()=>expect(rateCardPrice(3001,PROVISIONAL_RATE_CARD)).toBe(200000));
  it("prices exactly 22km at the fixed band amount",()=>expect(rateCardPrice(22000,PROVISIONAL_RATE_CARD)).toBe(400000));
  it("adds the beyond-22km rate and rounds the final quote safely",()=>{const result=quote({roadDistanceMeters:23000});expect(result.internal.rateCardPriceKobo).toBe(422000);expect(result.customerTotalKobo).toBe(425000)});
  it("rejects missing or invalid route distance",()=>expect(()=>quote({roadDistanceMeters:-1})).toThrow());
  it("rejects a zero-distance delivery",()=>expect(()=>quote({roadDistanceMeters:0})).toThrow("distance"));
  it("rejects negative operational inputs",()=>expect(()=>quote({additionalStops:-1})).toThrow("negative"));
});

describe("profitability protection",()=>{
  it("raises the floor when fuel cost is high",()=>{const cfg=config();cfg.fuelPricePerLitreKobo=1_000_000;const result=quote({roadDistanceMeters:12000},cfg);expect(result.customerTotalKobo).toBeGreaterThanOrEqual(result.internal.minimumProfitableCustomerTotalKobo)});
  it("raises the floor when delivery volume is low",()=>{const cfg=config();cfg.targetDeliveriesPerBikePerDay=1;const result=quote({},cfg);expect(result.internal.pricingReason).toBe("PROFITABILITY_FLOOR");expect(result.customerTotalKobo).toBeGreaterThan(180000)});
  it("keeps estimated margin at or above target",()=>{const result=quote({roadDistanceMeters:17000});expect(result.internal.estimatedOperatingMarginBps).toBeGreaterThanOrEqual(2000)});
  it("flags a market target that the floor cannot meet",()=>{const cfg=config();cfg.targetDeliveriesPerBikePerDay=1;const competitors=[250000,250000,250000].map((totalKobo,index)=>({id:String(index),totalKobo,quotedAt:new Date().toISOString(),verified:true,comparable:true}));const result=quote({competitorQuotes:competitors},cfg);expect(result.internal.flags).toContain("MARKET_TARGET_NOT_MET")});
  it("validates percentage-fee denominators",()=>{const cfg=config();cfg.targetOperatingMarginBps=9000;cfg.paymentPercentageFeeBps.online=1000;expect(()=>quote({},cfg)).toThrow("denominator")});
  it("handles tax and percentage payment fees without counting tax as revenue",()=>{const cfg=config();cfg.taxTreatment="inclusive";cfg.taxRateBps=750;cfg.paymentPercentageFeeBps.online=150;cfg.paymentFixedFeeKobo.online=10000;const result=quote({roadDistanceMeters:8000},cfg);expect(result.internal.taxKobo).toBeGreaterThan(0);expect(result.internal.paymentProcessingFeeKobo).toBeGreaterThan(10000);expect(result.internal.estimatedOperatingMarginBps).toBeGreaterThanOrEqual(cfg.targetOperatingMarginBps)});
});

describe("competitor evidence and promotions",()=>{
  const now=new Date("2026-11-12T12:00:00Z");
  it("uses the median of sufficient verified fresh quotes",()=>{const quotes=[280000,300000,320000].map((totalKobo,index)=>({id:String(index),totalKobo,quotedAt:"2026-11-10T12:00:00Z",verified:true,comparable:true}));expect(eligibleCompetitorMedian(quotes,config(),now)).toBe(300000);const result=quote({roadDistanceMeters:8000,competitorQuotes:quotes,now});expect(result.internal.competitorTargetKobo).toBe(270000)});
  it("falls back to the rate card with no competitor data",()=>expect(quote({roadDistanceMeters:8000}).internal.competitorMedianKobo).toBeNull());
  it("excludes stale competitor quotes",()=>{const quotes=[1,2,3].map(id=>({id:String(id),totalKobo:300000,quotedAt:"2026-01-01T00:00:00Z",verified:true,comparable:true}));expect(eligibleCompetitorMedian(quotes,config(),now)).toBeNull()});
  it("does not stack non-stackable discounts",()=>{const result=quote({roadDistanceMeters:23000,promotions:[{code:"ONE",kind:"fixed",value:10000,stackable:false},{code:"TWO",kind:"fixed",value:100000,stackable:false}]});expect(result.internal.promotionDiscountKobo).toBe(10000)});
  it("limits promotions at the margin floor",()=>{const result=quote({promotions:[{code:"DEEP",kind:"percentage",value:9000,stackable:false}]});expect(result.customerTotalKobo).toBeGreaterThanOrEqual(result.internal.minimumProfitableCustomerTotalKobo);expect(result.internal.flags).toContain("DISCOUNT_LIMITED_BY_MARGIN_FLOOR")});
});

describe("quote lifecycle metadata",()=>{
  it("expires ten minutes after creation",()=>{const now=new Date("2026-11-12T12:00:00Z");expect(quote({now}).expiresAt).toBe("2026-11-12T12:10:00.000Z")});
  it("preserves the active configuration version",()=>{const cfg=config();cfg.version=7;expect(quote({},cfg).configVersion).toBe(7)});
});
