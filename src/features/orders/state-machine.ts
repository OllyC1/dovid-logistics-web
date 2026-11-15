import type { DeliveryStatus, PaymentStatus } from "@/types/domain";

export const allowedTransitions: Record<DeliveryStatus, readonly DeliveryStatus[]> = {
  draft: ["awaiting_confirmation", "cancelled"],
  awaiting_confirmation: ["confirmed", "cancelled"],
  confirmed: ["awaiting_assignment", "cancelled"],
  awaiting_assignment: ["assigned", "cancelled"],
  assigned: ["rider_en_route_to_pickup", "cancelled"],
  rider_en_route_to_pickup: ["picked_up", "delivery_failed", "cancelled"],
  picked_up: ["in_transit", "delivery_failed"],
  in_transit: ["arrived_at_destination", "delivery_failed"],
  arrived_at_destination: ["awaiting_payment", "delivered", "delivery_failed"],
  awaiting_payment: ["delivered", "delivery_failed"],
  delivered: [],
  delivery_failed: ["awaiting_assignment", "cancelled"],
  cancelled: []
};

export function canTransition(from: DeliveryStatus, to: DeliveryStatus) {
  return allowedTransitions[from].includes(to);
}

export function canHandover(deliveryStatus: DeliveryStatus, paymentStatus: PaymentStatus, paymentRequired = true) {
  return deliveryStatus === "arrived_at_destination" && (!paymentRequired || paymentStatus === "paid");
}
