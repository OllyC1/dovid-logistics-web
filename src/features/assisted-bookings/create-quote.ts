import { evaluateOperatingSchedule, type OperatingSchedule } from "@/features/operations/scheduling";
import { createQuoteFromContext, loadActivePricingContext, loadComparableCompetitorQuotes, loadPromotion } from "@/features/pricing/service";
import { evaluateBookingEligibility, isWithinServiceHours } from "@/features/service-areas/eligibility";
import { isPointInGeoJson } from "@/features/service-areas/contains";
import type { ZoneGeoJson } from "@/features/service-areas/geometry";
import { getRouteDistance } from "@/lib/maps/routes";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { AssistedBookingDraftInput } from "@/features/assisted-bookings/schema";

type ActiveZone = {
  id: string;
  service_area_id: string;
  code: string;
  boundary_geojson: ZoneGeoJson;
  booking_eligibility: "standard" | "manual_approval" | "unavailable";
  dispatch_approval_required: boolean;
};

function durationSeconds(value: string) {
  return Math.max(0, Math.round(Number.parseFloat(value.replace("s", "")) || 0));
}

export async function createAssistedQuote(draftId: string, input: AssistedBookingDraftInput) {
  const admin = createSupabaseAdminClient();
  const now = new Date();
  const nowIso = now.toISOString();
  const { data: zoneRows, error: zoneError } = await admin.from("service_zones")
    .select("id,service_area_id,code,boundary_geojson,booking_eligibility,dispatch_approval_required")
    .eq("active", true).eq("operational_status", "active").neq("booking_eligibility", "unavailable")
    .lte("effective_from", nowIso).or(`effective_until.is.null,effective_until.gt.${nowIso}`);
  if (zoneError) throw zoneError;
  const zones = (zoneRows ?? []).filter((zone) => zone.boundary_geojson) as ActiveZone[];
  const pickupZone = zones.find((zone) => isPointInGeoJson(input.pickupCoordinates, zone.boundary_geojson));
  const deliveryZone = zones.find((zone) => isPointInGeoJson(input.deliveryCoordinates, zone.boundary_geojson));
  const stopZones = input.additionalStops.map((stop) => zones.find((zone) => isPointInGeoJson(stop.coordinates, zone.boundary_geojson)));
  const sameArea = Boolean(pickupZone && deliveryZone && pickupZone.service_area_id === deliveryZone.service_area_id && stopZones.every((zone) => zone?.service_area_id === pickupZone.service_area_id));
  if (!pickupZone || !deliveryZone || !sameArea || stopZones.some((zone) => !zone)) {
    return { quote: null, decision: "unsupported", message: "We're not delivering to this location just yet." } as const;
  }

  const [{ data: settings }, route, { data: fleet }, { data: assignments }] = await Promise.all([
    admin.from("service_area_operational_settings").select("standard_max_distance_meters,manual_max_distance_meters,service_hours,standard_package_sizes,oversized_requires_manual_approval,same_day_booking_cutoff,handover_buffer_minutes,safe_completion_buffer_minutes").eq("service_area_id", pickupZone.service_area_id).single(),
    getRouteDistance(input.pickupCoordinates, input.deliveryCoordinates, input.additionalStops.map((stop) => stop.coordinates)),
    admin.from("fleet_vehicles").select("id,operational_status,safety_status,assigned_rider_id,max_active_assignments,capacity_verified_at").in("operational_status", ["available", "assigned"]).eq("safety_status", "cleared"),
    admin.from("delivery_assignments").select("vehicle_id").is("released_at", null),
  ]);
  if (!settings) throw new Error("Operational eligibility settings are unavailable");
  const assignmentCount = new Map<string, number>();
  for (const assignment of assignments ?? []) assignmentCount.set(assignment.vehicle_id, (assignmentCount.get(assignment.vehicle_id) ?? 0) + 1);
  const availableFleetSlots = (fleet ?? []).reduce((total, vehicle) => {
    if (!vehicle.assigned_rider_id) return total;
    const active = assignmentCount.get(vehicle.id) ?? 0;
    const capacity = active > 0 && !vehicle.capacity_verified_at ? active : vehicle.max_active_assignments;
    return total + Math.max(0, capacity - active);
  }, 0);

  const context = await loadActivePricingContext(pickupZone.service_area_id, input.serviceLevel);
  const [competitorQuotes, promotions] = await Promise.all([
    loadComparableCompetitorQuotes({ serviceAreaId: pickupZone.service_area_id, serviceLevel: input.serviceLevel, packageCategory: input.packageCategory, roadDistanceMeters: route.distanceMeters, config: context.config }),
    loadPromotion(input.promotionCode),
  ]);
  const result = createQuoteFromContext({ roadDistanceMeters: route.distanceMeters, serviceLevel: input.serviceLevel, paymentMethod: input.paymentMethod, additionalStops: input.additionalStops.length, oversized: input.oversized, promotions, competitorQuotes }, context);
  const requestedAt = input.scheduledAt ? new Date(input.scheduledAt) : now;
  const schedule = evaluateOperatingSchedule({
    now,
    requestedAt,
    schedule: settings.service_hours as OperatingSchedule,
    sameDayCutoff: settings.same_day_booking_cutoff,
    routeDurationSeconds: durationSeconds(route.duration),
    handoverBufferMinutes: settings.handover_buffer_minutes,
    safeCompletionBufferMinutes: settings.safe_completion_buffer_minutes,
    riderAvailable: availableFleetSlots > 0,
  });
  const decision = evaluateBookingEligibility({
    pickupCovered: true,
    deliveryCovered: true,
    allStopsCovered: true,
    zonesAllowBooking: true,
    zoneRequiresApproval: pickupZone.dispatch_approval_required || deliveryZone.dispatch_approval_required || schedule.decision !== "same_day_eligible",
    roadDistanceMeters: route.distanceMeters,
    standardMaxDistanceMeters: settings.standard_max_distance_meters,
    manualMaxDistanceMeters: settings.manual_max_distance_meters,
    withinServiceHours: isWithinServiceHours(requestedAt, settings.service_hours),
    availableFleetSlots,
    packageSize: input.packageSize,
    standardPackageSizes: settings.standard_package_sizes as string[],
    oversized: input.oversized,
    oversizedRequiresApproval: settings.oversized_requires_manual_approval,
    estimatedProfitKobo: result.internal.estimatedProfitKobo,
  });
  const requestPayload = {
    ...input,
    pickupZoneId: pickupZone.id,
    pickupZoneCode: pickupZone.code,
    deliveryZoneId: deliveryZone.id,
    deliveryZoneCode: deliveryZone.code,
    eligibilityDecision: decision.decision,
    eligibilityReasonCode: decision.reasonCode,
    scheduleDecision: schedule.decision,
    scheduleReason: schedule.reason,
    routeDurationSeconds: durationSeconds(route.duration),
  };
  if (decision.decision !== "standard_eligible") {
    const requestStatus = decision.decision === "manual_approval" || decision.decision === "manual_quote" ? "pending" : "rejected";
    await admin.from("delivery_availability_requests").insert({ service_area_id: pickupZone.service_area_id, pickup_zone_id: pickupZone.id, delivery_zone_id: deliveryZone.id, request_payload: requestPayload, road_distance_meters: route.distanceMeters, estimated_duration_seconds: durationSeconds(route.duration), decision: decision.decision, reason_code: decision.reasonCode, status: requestStatus, pricing_snapshot: { customerTotalKobo: result.customerTotalKobo, currency: result.currency, internal: result.internal, includedCharges: result.includedCharges } });
    return { quote: null, decision: decision.decision, message: decision.message } as const;
  }
  const quoteId = crypto.randomUUID();
  const { error: quoteError } = await admin.from("quotes").insert({ id: quoteId, pricing_rule_id: null, pricing_configuration_version_id: context.configurationVersionId, rate_card_id: context.rateCardId, request_payload: requestPayload, distance_meters: route.distanceMeters, amount_minor: result.customerTotalKobo, currency: result.currency, expires_at: result.expiresAt, status: "created", service_level: input.serviceLevel, payment_method: input.paymentMethod, duration_seconds: durationSeconds(route.duration), customer_breakdown: result.includedCharges, internal_breakdown: result.internal, pricing_flags: result.internal.flags, operational_approval_status: "not_required", booking_origin: input.bookingOrigin });
  if (quoteError) throw quoteError;
  const { error: costError } = await admin.from("quote_cost_estimates").insert({ quote_id: quoteId, estimated_operational_cost_kobo: result.internal.operationalCostKobo, minimum_profitable_price_kobo: result.internal.minimumProfitableCustomerTotalKobo, estimated_payment_fee_kobo: result.internal.paymentProcessingFeeKobo, estimated_tax_kobo: result.internal.taxKobo, estimated_profit_kobo: result.internal.estimatedProfitKobo, estimated_operating_margin_bps: result.internal.estimatedOperatingMarginBps, assumptions_snapshot: context.config });
  if (costError) { await admin.from("quotes").delete().eq("id", quoteId); throw costError; }
  const { error: draftError } = await admin.from("assisted_booking_drafts").update({ quote_id: quoteId, status: "quoted" }).eq("id", draftId);
  if (draftError) throw draftError;
  return { quote: { id: quoteId, amountMinor: result.customerTotalKobo, currency: result.currency, expiresAt: result.expiresAt, distanceMeters: route.distanceMeters, duration: route.duration, includedCharges: result.includedCharges }, decision: decision.decision, message: decision.message } as const;
}

