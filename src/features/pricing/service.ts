import { calculateDeliveryQuote } from "@/features/pricing/engine";
import type { EligibleCompetitorQuote, FinancialConfig, PromotionInput, QuoteEngineInput, RateCardBand } from "@/features/pricing/types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type PricingContext = {
  configurationVersionId: string;
  rateCardId: string;
  config: FinancialConfig;
  bands: RateCardBand[];
};

export async function loadActivePricingContext(serviceAreaId: string, serviceLevel: QuoteEngineInput["serviceLevel"]) {
  const admin = createSupabaseAdminClient();
  const now = new Date().toISOString();
  const { data: version, error: versionError } = await admin.from("pricing_configuration_versions").select("id,version,assumptions,pricing_configurations!inner(active,city)").eq("status", "active").eq("pricing_configurations.active", true).lte("effective_at", now).order("effective_at", { ascending: false }).limit(1).maybeSingle();
  if (versionError || !version) throw new Error("Active financial configuration is unavailable");
  const { data: rateCards, error: rateError } = await admin.from("rate_cards").select("id,service_level,service_area_id,expires_at,rate_card_bands(minimum_distance_meters,maximum_distance_meters,price_kobo,additional_per_kilometer_kobo,position)").eq("configuration_version_id", version.id).in("service_level", serviceLevel === "standard" ? ["standard"] : [serviceLevel, "standard"]).eq("active", true).lte("effective_at", now).order("effective_at", { ascending: false });
  const eligibleCards=(rateCards??[]).filter(card=>(card.service_area_id===serviceAreaId||card.service_area_id===null)&&(!card.expires_at||card.expires_at>now));
  const rateCard=eligibleCards.find(card=>card.service_level===serviceLevel&&card.service_area_id===serviceAreaId)??eligibleCards.find(card=>card.service_level===serviceLevel&&card.service_area_id===null)??eligibleCards.find(card=>card.service_level==="standard"&&card.service_area_id===serviceAreaId)??eligibleCards.find(card=>card.service_level==="standard"&&card.service_area_id===null);
  if (rateError || !rateCard) throw new Error("Approved rate card is unavailable for this service area and service level");
  const config = { ...(version.assumptions as FinancialConfig), version: version.version };
  const bands = [...(rateCard.rate_card_bands ?? [])].sort((left, right) => left.position - right.position).map((band) => ({ minimumDistanceMeters: band.minimum_distance_meters, maximumDistanceMeters: band.maximum_distance_meters, priceKobo: band.price_kobo, additionalPerKilometerKobo: band.additional_per_kilometer_kobo ?? undefined }));
  return { configurationVersionId: version.id, rateCardId: rateCard.id, config, bands } satisfies PricingContext;
}

export async function loadComparableCompetitorQuotes(input: { serviceAreaId: string; serviceLevel: string; packageCategory: string; roadDistanceMeters: number; config: FinancialConfig }) {
  const admin = createSupabaseAdminClient();
  const freshness = new Date(Date.now() - input.config.competitorFreshnessDays * 86_400_000).toISOString();
  const { data } = await admin.from("competitor_quotes").select("id,quoted_total_kobo,quoted_at,expires_at,verification_status,comparable,road_distance_meters").eq("service_area_id", input.serviceAreaId).eq("service_level", input.serviceLevel).eq("package_category", input.packageCategory).eq("verification_status", "verified").eq("comparable", true).gte("quoted_at", freshness);
  return (data ?? []).filter((quote) => Math.abs(quote.road_distance_meters - input.roadDistanceMeters) <= Math.max(1_000, Math.ceil(input.roadDistanceMeters * 0.15))).map((quote) => ({ id: quote.id, totalKobo: quote.quoted_total_kobo, quotedAt: quote.quoted_at, expiresAt: quote.expires_at, verified: quote.verification_status === "verified", comparable: quote.comparable })) satisfies EligibleCompetitorQuote[];
}

export async function loadPromotion(code?: string | null) {
  const admin = createSupabaseAdminClient();
  const now = new Date().toISOString();
  let query = admin.from("promotions").select("code,kind,value,maximum_discount_kobo,stackable,auto_apply,allow_below_profitability_floor").eq("active", true).lte("starts_at", now).or(`ends_at.is.null,ends_at.gt.${now}`);
  query = code ? query.eq("code", code.toUpperCase()) : query.eq("auto_apply", true);
  const { data } = await query.order("created_at", { ascending: true }).limit(1).maybeSingle();
  return data ? [{ code: data.code, kind: data.kind, value: data.value, maximumDiscountKobo: data.maximum_discount_kobo, stackable: data.stackable, autoApply: data.auto_apply, allowBelowProfitabilityFloor: data.allow_below_profitability_floor } as PromotionInput] : [];
}

export function createQuoteFromContext(input: QuoteEngineInput, context: PricingContext) {
  return calculateDeliveryQuote(input, context.config, context.bands);
}
