import { describe, expect, it } from "vitest";
import { evaluateAttemptResolution } from "@/features/operations/delivery-attempts";

describe("failed delivery resolutions", () => {
  it("never automatically charges for redelivery", () => {
    expect(evaluateAttemptResolution({ reason: "recipient_unavailable", resolution: "schedule_redelivery", attributableTo: "customer" })).toMatchObject({ mayProposeCustomerCharge: true, automaticallyChargeCustomer: false });
  });
  it("flags wrong destinations for reviewed correction", () => {
    expect(evaluateAttemptResolution({ reason: "address_problem", resolution: "correct_address", attributableTo: "under_review" }).requiresCorrectedAddress).toBe(true);
  });
  it("escalates unsafe delivery without requiring the rider to remain", () => {
    expect(evaluateAttemptResolution({ reason: "unsafe_delivery", resolution: "open_incident", attributableTo: "under_review" }).requiresIncident).toBe(true);
  });
  it("flags receiver payment refusal for payment resolution", () => {
    expect(evaluateAttemptResolution({ reason: "payment_refused", resolution: "return_to_sender", attributableTo: "under_review" }).requiresPaymentResolution).toBe(true);
  });
  it("does not propose customer charges for Dovid-attributable failures", () => {
    expect(evaluateAttemptResolution({ reason: "recipient_unavailable", resolution: "schedule_redelivery", attributableTo: "dovid" }).mayProposeCustomerCharge).toBe(false);
  });
});

