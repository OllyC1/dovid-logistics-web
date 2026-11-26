import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { hashAssistedSecret } from "@/features/assisted-bookings/security";
import { calculateDispatchCapacity } from "@/features/dispatch/readiness";
import { deliveryQuoteRequestSchema } from "@/features/pricing/quote-request";
import { createQuoteFromContext, loadActivePricingContext, loadComparableCompetitorQuotes, loadPromotion } from "@/features/pricing/service";
import { evaluateBookingEligibility, isWithinServiceHours } from "@/features/service-areas/eligibility";
import { isPointInGeoJson } from "@/features/service-areas/contains";
import type { ZoneGeoJson } from "@/features/service-areas/geometry";
import { publicBookingsEnabled } from "@/lib/launch-controls";
import { getRouteDistance } from "@/lib/maps/routes";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { siteConfig } from "@/config/site";

const attempts = new Map<string, { count: number; resetAt: number }>();
function rateLimited(ip: string) { const now = Date.now(); const current = attempts.get(ip); if (!current || current.resetAt < now) { attempts.set(ip, { count: 1, resetAt: now + 60_000 }); return false; } current.count += 1; return current.count > 12; }
function durationSeconds(duration: string) { return Math.max(0, Math.round(Number.parseFloat(duration.replace("s", "")) || 0)); }

function approvalScope(payload: Record<string, unknown>) {
  return JSON.stringify({
    pickupAddress: payload.pickupAddress,
    pickupCoordinates: payload.pickupCoordinates,
    deliveryAddress: payload.deliveryAddress,
    deliveryCoordinates: payload.deliveryCoordinates,
    packageCategory: payload.packageCategory,
    packageSize: payload.packageSize,
    serviceLevel: payload.serviceLevel,
    additionalStops: payload.additionalStops,
    oversized: payload.oversized,
    scheduledAt: payload.scheduledAt ?? null,
  });
}

type ActiveZone = {
  id: string;
  service_area_id: string;
  code: string;
  boundary_geojson: ZoneGeoJson;
  booking_eligibility: "standard" | "manual_approval" | "unavailable";
  dispatch_approval_required: boolean;
  is_citywide: boolean;
};

function manualDecisionMessage(reasonCode: string, distanceMeters: number, standardMaxDistanceMeters: number) {
  if (reasonCode === "distance_requires_dispatch_review") return `This route is ${(distanceMeters / 1000).toFixed(1)} km. Routes above ${(standardMaxDistanceMeters / 1000).toFixed(0)} km need a quick confirmation from dispatch.`;
  if (reasonCode === "outside_service_hours") return "This request is outside today’s automatic service hours, so dispatch needs to confirm a safe collection time.";
  if (reasonCode === "operational_review_required") return "One part of this route or parcel needs a quick safety check from dispatch.";
  return "This route needs confirmation from our dispatch team.";
}

export async function POST(request: NextRequest) {
  if (!publicBookingsEnabled()) return NextResponse.json({ error: "Online bookings are not open yet. Please contact Dovid Logistics for help." }, { status: 503 });
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (rateLimited(ip)) return NextResponse.json({ error: "Too many availability checks. Please wait and try again.", code: "RATE_LIMITED" }, { status: 429 });
  const parsed = deliveryQuoteRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Please check the delivery details and try again.", code: "INVALID_REQUEST", issues: parsed.error.flatten() }, { status: 400 });

  const admin = createSupabaseAdminClient();
  const requestPayload = parsed.data;
  try {
    const now = new Date();
    const nowIso = now.toISOString();
    const { data: zoneRows, error: zoneError } = await admin.from("service_zones")
      .select("id,service_area_id,code,boundary_geojson,booking_eligibility,dispatch_approval_required,is_citywide")
      .eq("active", true).eq("operational_status", "active").neq("booking_eligibility", "unavailable")
      .order("priority", { ascending: true })
      .lte("effective_from", nowIso).or(`effective_until.is.null,effective_until.gt.${nowIso}`);
    if (zoneError) throw zoneError;
    const zones = ((zoneRows ?? []).filter((zone) => zone.boundary_geojson) as ActiveZone[])
      .sort((left, right) => Number(left.is_citywide) - Number(right.is_citywide));
    const pickupZone = zones.find((zone) => isPointInGeoJson(parsed.data.pickupCoordinates, zone.boundary_geojson));
    const deliveryZone = zones.find((zone) => isPointInGeoJson(parsed.data.deliveryCoordinates, zone.boundary_geojson));
    const stopZones = parsed.data.additionalStops.map((stop) => zones.find((zone) => isPointInGeoJson(stop.coordinates, zone.boundary_geojson)));
    const sameArea = Boolean(pickupZone && deliveryZone && pickupZone.service_area_id === deliveryZone.service_area_id && stopZones.every((zone) => zone?.service_area_id === pickupZone.service_area_id));

    if (!pickupZone || !deliveryZone || !sameArea || stopZones.some((zone) => !zone)) {
      const { data: availability } = await admin.from("delivery_availability_requests").insert({
        service_area_id: pickupZone?.service_area_id ?? deliveryZone?.service_area_id ?? null,
        pickup_zone_id: pickupZone?.id ?? null,
        delivery_zone_id: deliveryZone?.id ?? null,
        request_payload: requestPayload,
        decision: "unsupported",
        reason_code: "outside_approved_coverage",
        status: "rejected"
      }).select("id").single();
      return NextResponse.json({ error: "We're not delivering to this location just yet.", message: "We're not delivering to this location just yet.", code: "OUTSIDE_APPROVED_COVERAGE", eligibility: "unsupported", availabilityRequestId: availability?.id }, { status: 422 });
    }

    const [{ data: settings }, route] = await Promise.all([
      admin.from("service_area_operational_settings").select("standard_max_distance_meters,manual_max_distance_meters,service_hours,standard_package_sizes,oversized_requires_manual_approval,max_active_assignments_per_rider").eq("service_area_id", pickupZone.service_area_id).single(),
      getRouteDistance(parsed.data.pickupCoordinates, parsed.data.deliveryCoordinates, parsed.data.additionalStops.map((stop) => stop.coordinates))
    ]);
    if (!settings) throw new Error("Operational eligibility settings are unavailable");

    let approvedRequest: { id: string; reference_code: string; status: string; review_reason: string | null } | null = null;
    if (parsed.data.approvalReference) {
      if (!parsed.data.approvalToken) return NextResponse.json({ error: "Open the secure approval link before continuing.", code: "APPROVAL_TOKEN_REQUIRED" }, { status: 403 });
      const { data: access } = await admin.from("availability_request_access_tokens")
        .select("availability_request_id,expires_at")
        .eq("token_hash", hashAssistedSecret(parsed.data.approvalToken))
        .maybeSingle();
      if (!access || new Date(access.expires_at) <= now) return NextResponse.json({ error: "This approval link is invalid or has expired.", code: "APPROVAL_TOKEN_INVALID" }, { status: 403 });
      const { data: request, error: requestError } = await admin.from("delivery_availability_requests")
        .select("id,reference_code,status,review_reason,request_payload")
        .eq("id", access.availability_request_id)
        .eq("reference_code", parsed.data.approvalReference)
        .maybeSingle();
      if (requestError) throw requestError;
      const previousPayload = (request?.request_payload ?? {}) as Record<string, unknown>;
      const matchesRoute = request && approvalScope(previousPayload) === approvalScope(parsed.data);
      if (!request || !matchesRoute) {
        return NextResponse.json({ error: "That approval reference does not match this route.", code: "APPROVAL_REFERENCE_MISMATCH" }, { status: 404 });
      }
      if (request.status === "rejected") {
        return NextResponse.json({
          error: request.review_reason || "Dispatch could not approve this route.",
          message: request.review_reason || "Dispatch could not approve this route.",
          eligibility: "rejected",
          approvalState: "rejected",
          continuationToken: parsed.data.approvalToken,
          availabilityRequestId: request.id,
          manualAssistance: {
            reference: request.reference_code,
            email: siteConfig.support.email,
            phone: siteConfig.support.phone,
            emailUrl: `mailto:${siteConfig.support.email}?subject=${encodeURIComponent(`Delivery request ${request.reference_code}`)}`,
            phoneUrl: `tel:${siteConfig.support.phone}`,
            whatsappUrl: `https://wa.me/${siteConfig.support.whatsapp}?text=${encodeURIComponent(`Hello Dovid Logistics, I need help with delivery request ${request.reference_code}.`)}`,
          },
        }, { status: 409 });
      }
      if (request.status === "pending") {
        return NextResponse.json({
          message: "Dispatch is still reviewing this route. Check again shortly or contact us using the reference below.",
          eligibility: "manual_approval",
          approvalState: "pending",
          continuationToken: parsed.data.approvalToken,
          availabilityRequestId: request.id,
          manualAssistance: {
            reference: request.reference_code,
            email: siteConfig.support.email,
            phone: siteConfig.support.phone,
            emailUrl: `mailto:${siteConfig.support.email}?subject=${encodeURIComponent(`Delivery approval ${request.reference_code}`)}`,
            phoneUrl: `tel:${siteConfig.support.phone}`,
            whatsappUrl: `https://wa.me/${siteConfig.support.whatsapp}?text=${encodeURIComponent(`Hello Dovid Logistics, please review delivery request ${request.reference_code}.`)}`,
          },
        }, { status: 202 });
      }
      if (request.status !== "approved") {
        return NextResponse.json({ error: "This approval reference is no longer active.", code: "APPROVAL_REFERENCE_INACTIVE" }, { status: 409 });
      }
      approvedRequest = request;
    }

    const context = await loadActivePricingContext(pickupZone.service_area_id, parsed.data.serviceLevel);
    const [competitorQuotes, promotions, fleetResult, assignmentResult, riderMembershipResult, riderProfileResult] = await Promise.all([
      loadComparableCompetitorQuotes({ serviceAreaId: pickupZone.service_area_id, serviceLevel: parsed.data.serviceLevel, packageCategory: parsed.data.packageCategory, roadDistanceMeters: route.distanceMeters, config: context.config }),
      loadPromotion(parsed.data.promotionCode),
      admin.from("fleet_vehicles").select("id,registration_number,operational_status,safety_status,assigned_rider_id,max_active_assignments,capacity_verified_at").in("operational_status", ["available", "assigned"]).eq("safety_status", "cleared"),
      admin.from("delivery_assignments").select("vehicle_id,rider_id").is("released_at", null),
      admin.from("staff_memberships").select("user_id").eq("staff_role", "rider").eq("status", "active"),
      admin.from("profiles").select("id").eq("role", "rider")
    ]);
    const result = createQuoteFromContext({ roadDistanceMeters: route.distanceMeters, serviceLevel: parsed.data.serviceLevel, paymentMethod: parsed.data.paymentMethod, additionalStops: parsed.data.additionalStops.length, oversized: parsed.data.oversized, promotions, competitorQuotes }, context);
    const riderProfileIds = new Set((riderProfileResult.data ?? []).map((profile) => profile.id));
    const activeNamedRiderIds = (riderMembershipResult.data ?? [])
      .map((membership) => membership.user_id)
      .filter((riderId) => riderProfileIds.has(riderId));
    const availableFleetSlots = calculateDispatchCapacity({
      vehicles: fleetResult.data ?? [],
      activeNamedRiderIds,
      activeAssignments: assignmentResult.data ?? [],
      riderParcelLimit: settings.max_active_assignments_per_rider,
    }).availableParcelSlots;
    const decision = evaluateBookingEligibility({
      pickupCovered: true,
      deliveryCovered: true,
      allStopsCovered: true,
      zonesAllowBooking: pickupZone.booking_eligibility !== "unavailable" && deliveryZone.booking_eligibility !== "unavailable",
      zoneRequiresApproval: !approvedRequest && (pickupZone.dispatch_approval_required || deliveryZone.dispatch_approval_required || pickupZone.booking_eligibility === "manual_approval" || deliveryZone.booking_eligibility === "manual_approval"),
      roadDistanceMeters: route.distanceMeters,
      standardMaxDistanceMeters: approvedRequest ? Math.max(settings.standard_max_distance_meters, route.distanceMeters) : settings.standard_max_distance_meters,
      manualMaxDistanceMeters: approvedRequest ? Math.max(settings.manual_max_distance_meters, route.distanceMeters) : settings.manual_max_distance_meters,
      withinServiceHours: approvedRequest ? true : isWithinServiceHours(now, settings.service_hours),
      availableFleetSlots,
      packageSize: parsed.data.packageSize,
      standardPackageSizes: approvedRequest ? [...settings.standard_package_sizes as string[], parsed.data.packageSize] : settings.standard_package_sizes as string[],
      oversized: parsed.data.oversized,
      oversizedRequiresApproval: approvedRequest ? false : settings.oversized_requires_manual_approval,
      estimatedProfitKobo: result.internal.estimatedProfitKobo,
      allowBelowProfitabilityFloor: promotions.some((promotion) => promotion.allowBelowProfitabilityFloor)
    });
    const enrichedPayload = {
      ...requestPayload,
      pickupZoneId: pickupZone.id,
      pickupZoneCode: pickupZone.code,
      deliveryZoneId: deliveryZone.id,
      deliveryZoneCode: deliveryZone.code,
      eligibilityDecision: decision.decision,
      eligibilityReasonCode: decision.reasonCode,
      routeDurationSeconds: durationSeconds(route.duration),
      approvalReference: approvedRequest?.reference_code
    };

    if (decision.decision !== "standard_eligible") {
      const status = decision.decision === "manual_approval" || decision.decision === "manual_quote" ? "pending" : "rejected";
      const { data: availability, error: availabilityError } = await admin.from("delivery_availability_requests").insert({
        service_area_id: pickupZone.service_area_id,
        pickup_zone_id: pickupZone.id,
        delivery_zone_id: deliveryZone.id,
        request_payload: enrichedPayload,
        road_distance_meters: route.distanceMeters,
        estimated_duration_seconds: durationSeconds(route.duration),
        decision: decision.decision,
        reason_code: decision.reasonCode,
        status,
        pricing_snapshot: { customerTotalKobo: result.customerTotalKobo, currency: result.currency, internal: result.internal, includedCharges: result.includedCharges }
      }).select("id,reference_code").single();
      if (availabilityError) throw availabilityError;
      let continuationToken: string | undefined;
      if (status === "pending") {
        const rawToken = randomBytes(32).toString("base64url");
        const { error: tokenError } = await admin.from("availability_request_access_tokens").insert({
          availability_request_id: availability.id,
          token_hash: hashAssistedSecret(rawToken),
          expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        });
        if (tokenError) throw new Error("The secure dispatch review could not be prepared.");
        continuationToken = rawToken;
      }
      const responseStatus = decision.decision === "capacity_unavailable" ? 409 : decision.decision === "unsupported" ? 422 : 202;
      const customerMessage = decision.decision === "manual_approval"
        ? manualDecisionMessage(decision.reasonCode, route.distanceMeters, settings.standard_max_distance_meters)
        : decision.message;
      const manualMessage = `Hello Dovid Logistics, please review this delivery: ${parsed.data.pickupAddress} to ${parsed.data.deliveryAddress}. Request reference: ${availability.reference_code}.`;
      return NextResponse.json({
        ...(responseStatus >= 400 ? { error: customerMessage } : {}),
        message: customerMessage,
        eligibility: decision.decision,
        reasonCode: decision.reasonCode,
        availabilityRequestId: availability.id,
        distanceMeters: route.distanceMeters,
        duration: route.duration,
        automaticDistanceLimitMeters: settings.standard_max_distance_meters,
        manualDistanceLimitMeters: settings.manual_max_distance_meters,
        pickupZoneCode: pickupZone.code,
        deliveryZoneCode: deliveryZone.code,
        ...(continuationToken ? { continuationToken } : {}),
        ...(responseStatus < 400 ? {
          manualAssistance: {
            reference: availability.reference_code,
            email: siteConfig.support.email,
            phone: siteConfig.support.phone,
            emailUrl: `mailto:${siteConfig.support.email}?subject=${encodeURIComponent(`Delivery approval ${availability.reference_code}`)}&body=${encodeURIComponent(manualMessage)}`,
            phoneUrl: `tel:${siteConfig.support.phone}`,
            whatsappUrl: `https://wa.me/${siteConfig.support.whatsapp}?text=${encodeURIComponent(manualMessage)}`,
          },
        } : {}),
      }, { status: responseStatus });
    }

    const quoteId = crypto.randomUUID();
    const guestQuoteToken = randomBytes(32).toString("base64url");
    const { error: quoteError } = await admin.from("quotes").insert({ id: quoteId, customer_id: null, pricing_rule_id: null, pricing_configuration_version_id: context.configurationVersionId, rate_card_id: context.rateCardId, request_payload: enrichedPayload, distance_meters: route.distanceMeters, amount_minor: result.customerTotalKobo, currency: result.currency, expires_at: result.expiresAt, status: "created", service_level: parsed.data.serviceLevel, payment_method: parsed.data.paymentMethod, duration_seconds: durationSeconds(route.duration), customer_breakdown: result.includedCharges, internal_breakdown: result.internal, pricing_flags: result.internal.flags, operational_approval_status: approvedRequest ? "approved" : "not_required" });
    if (quoteError) throw quoteError;
    const { error: costError } = await admin.from("quote_cost_estimates").insert({ quote_id: quoteId, estimated_operational_cost_kobo: result.internal.operationalCostKobo, minimum_profitable_price_kobo: result.internal.minimumProfitableCustomerTotalKobo, estimated_payment_fee_kobo: result.internal.paymentProcessingFeeKobo, estimated_tax_kobo: result.internal.taxKobo, estimated_profit_kobo: result.internal.estimatedProfitKobo, estimated_operating_margin_bps: result.internal.estimatedOperatingMarginBps, assumptions_snapshot: context.config });
    if (costError) { await admin.from("quotes").delete().eq("id", quoteId); throw costError; }
    if (guestQuoteToken) {
      const { error: accessError } = await admin.from("guest_quote_access_tokens").insert({ quote_id: quoteId, token_hash: hashAssistedSecret(guestQuoteToken), expires_at: result.expiresAt });
      if (accessError) {
        await admin.from("quote_cost_estimates").delete().eq("quote_id", quoteId);
        await admin.from("quotes").delete().eq("id", quoteId);
        throw new Error("The secure guest quote could not be prepared.");
      }
    }
    return NextResponse.json({ quoteId, ...(guestQuoteToken ? { guestQuoteToken } : {}), status: "created", eligibility: decision.decision, message: decision.message, currency: result.currency, customerTotalKobo: result.customerTotalKobo, amountMinor: result.customerTotalKobo, expiresAt: result.expiresAt, distanceMeters: route.distanceMeters, duration: route.duration, serviceLevel: parsed.data.serviceLevel, includedCharges: result.includedCharges, explanation: "Delivery fee calculated using your route, operating capacity and service type." }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "We could not check this route right now.", code: "AVAILABILITY_UNAVAILABLE", manualReview: true }, { status: 503 });
  }
}
