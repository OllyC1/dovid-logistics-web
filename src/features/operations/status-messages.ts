const messages: Record<string, string> = {
  scheduled: "Delivery scheduled",
  rider_en_route_to_pickup: "Rider collecting packages",
  picked_up: "Package picked up",
  in_transit: "Delivery in progress",
  arrived_at_destination: "Rider arrived",
  waiting_for_recipient: "Waiting for recipient",
  surcharge_pending: "Extra charge awaiting approval",
  delivery_failed: "Failed delivery attempt",
  redelivery_requested: "Redelivery requested",
  redelivery_scheduled: "Redelivery scheduled",
  returning_to_sender: "Returning to sender",
  returned_to_sender: "Returned to sender",
  delivered: "Delivered successfully",
};

export function customerOperationMessage(status: string) {
  return messages[status] ?? status.replaceAll("_", " ").replace(/^./, (value) => value.toUpperCase());
}

