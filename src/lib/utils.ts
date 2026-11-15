import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatMoney(amountMinor: number, currency = "NGN") {
  return new Intl.NumberFormat("en-NG", { style: "currency", currency, maximumFractionDigits: 0 }).format(amountMinor / 100);
}

const deliveryStatusLabels: Record<string, string> = {
  draft: "Booking started",
  awaiting_confirmation: "Waiting for confirmation",
  confirmed: "Booking confirmed",
  awaiting_assignment: "Finding a rider",
  assigned: "Rider assigned",
  rider_en_route_to_pickup: "Rider heading to pickup",
  picked_up: "Parcel collected",
  in_transit: "On the way",
  arrived_at_destination: "Rider has arrived",
  awaiting_payment: "Waiting for payment",
  delivered: "Delivered",
  delivery_failed: "Delivery needs attention",
  cancelled: "Cancelled"
};

const paymentStatusLabels: Record<string, string> = {
  unpaid: "Not paid",
  pending: "Payment pending",
  processing: "Confirming payment",
  paid: "Paid",
  failed: "Payment unsuccessful",
  expired: "Payment link expired",
  refunded: "Refunded",
  partially_refunded: "Partly refunded"
};

export function formatDeliveryStatus(status: string) {
  return deliveryStatusLabels[status] ?? status.replaceAll("_", " ");
}

export function formatPaymentStatus(status: string) {
  return paymentStatusLabels[status] ?? status.replaceAll("_", " ");
}
