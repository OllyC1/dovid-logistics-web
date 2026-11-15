export type AttemptReason = "recipient_unavailable" | "address_problem" | "recipient_refused" | "payment_refused" | "access_blocked" | "unsafe_delivery" | "incident_escalated";
export type AttemptResolution = "retry_immediately" | "schedule_redelivery" | "correct_address" | "return_to_sender" | "authorized_hold" | "open_incident" | "cancel";

export function evaluateAttemptResolution(input: { reason: AttemptReason; resolution: AttemptResolution; attributableTo: "customer" | "dovid" | "under_review" }) {
  const requiresIncident = input.reason === "unsafe_delivery" || input.reason === "incident_escalated" || input.resolution === "open_incident";
  const requiresCorrectedAddress = input.reason === "address_problem" && input.resolution === "correct_address";
  const requiresPaymentResolution = input.reason === "payment_refused";
  const mayProposeCustomerCharge = input.attributableTo === "customer" && ["schedule_redelivery", "return_to_sender"].includes(input.resolution);
  return { requiresIncident, requiresCorrectedAddress, requiresPaymentResolution, mayProposeCustomerCharge, automaticallyChargeCustomer: false };
}

