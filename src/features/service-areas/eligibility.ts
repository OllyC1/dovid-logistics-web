export type EligibilityDecision = "standard_eligible" | "manual_approval" | "manual_quote" | "unsupported" | "capacity_unavailable";

export type EligibilityInput = {
  pickupCovered: boolean;
  deliveryCovered: boolean;
  allStopsCovered: boolean;
  zonesAllowBooking: boolean;
  zoneRequiresApproval: boolean;
  roadDistanceMeters: number;
  standardMaxDistanceMeters: number;
  manualMaxDistanceMeters: number;
  withinServiceHours: boolean;
  availableFleetSlots: number;
  packageSize: string;
  standardPackageSizes: string[];
  oversized: boolean;
  oversizedRequiresApproval: boolean;
  estimatedProfitKobo: number;
  allowBelowProfitabilityFloor?: boolean;
};

const messages: Record<EligibilityDecision, string> = {
  standard_eligible: "Great! We can check delivery availability for this route.",
  manual_approval: "This route needs confirmation from our dispatch team.",
  manual_quote: "This route needs confirmation from our dispatch team.",
  unsupported: "We're not delivering to this location just yet.",
  capacity_unavailable: "We do not currently have an available rider and motorcycle for this delivery. Please try again later or contact Dovid Logistics."
};

export function evaluateBookingEligibility(input: EligibilityInput) {
  if (!input.pickupCovered || !input.deliveryCovered || !input.allStopsCovered || !input.zonesAllowBooking) return { decision: "unsupported" as const, reasonCode: "outside_approved_coverage", message: messages.unsupported };
  if (!Number.isFinite(input.roadDistanceMeters) || input.roadDistanceMeters <= 0) return { decision: "unsupported" as const, reasonCode: "invalid_route_distance", message: messages.unsupported };
  if (input.estimatedProfitKobo < 0 && !input.allowBelowProfitabilityFloor) return { decision: "unsupported" as const, reasonCode: "profitability_floor_not_met", message: messages.unsupported };
  if (!input.withinServiceHours) return { decision: "manual_approval" as const, reasonCode: "outside_service_hours", message: messages.manual_approval };
  if (input.roadDistanceMeters > input.manualMaxDistanceMeters) return { decision: "manual_quote" as const, reasonCode: "distance_above_manual_threshold", message: messages.manual_quote };
  if (input.availableFleetSlots <= 0) return { decision: "capacity_unavailable" as const, reasonCode: "fleet_at_capacity", message: messages.capacity_unavailable };
  if (input.zoneRequiresApproval || input.roadDistanceMeters > input.standardMaxDistanceMeters || !input.standardPackageSizes.includes(input.packageSize) || (input.oversized && input.oversizedRequiresApproval)) {
    return { decision: "manual_approval" as const, reasonCode: input.roadDistanceMeters > input.standardMaxDistanceMeters ? "distance_requires_dispatch_review" : "operational_review_required", message: messages.manual_approval };
  }
  return { decision: "standard_eligible" as const, reasonCode: "standard_checks_passed", message: messages.standard_eligible };
}

type ServiceHours = Record<string, [string, string] | string | null | undefined> & { timezone?: string };

export function isWithinServiceHours(now: Date, hours: ServiceHours) {
  const timezone = typeof hours.timezone === "string" ? hours.timezone : "Africa/Lagos";
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: timezone, weekday: "long", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const weekday = parts.find((part) => part.type === "weekday")?.value.toLowerCase();
  const hour = parts.find((part) => part.type === "hour")?.value;
  const minute = parts.find((part) => part.type === "minute")?.value;
  if (!weekday || !hour || !minute) return false;
  const window = hours[weekday];
  if (!Array.isArray(window) || window.length !== 2) return false;
  const current = `${hour}:${minute}`;
  return current >= window[0] && current <= window[1];
}
