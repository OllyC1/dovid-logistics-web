export const deliveryStatuses = ["draft", "awaiting_confirmation", "confirmed", "awaiting_assignment", "assigned", "rider_en_route_to_pickup", "picked_up", "in_transit", "arrived_at_destination", "awaiting_payment", "delivered", "delivery_failed", "cancelled"] as const;
export type DeliveryStatus = (typeof deliveryStatuses)[number];
export const paymentStatuses = ["unpaid", "pending", "processing", "paid", "failed", "expired", "refunded", "partially_refunded"] as const;
export type PaymentStatus = (typeof paymentStatuses)[number];
export type Coordinates = { latitude: number; longitude: number };
