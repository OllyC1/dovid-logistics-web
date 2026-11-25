export function remainingDispatchSlots(input: {
  vehicleCapacity: number;
  riderCapacity: number;
  vehicleWorkload: number;
  riderWorkload: number;
}) {
  const capacity = Math.max(0, Math.min(input.vehicleCapacity, input.riderCapacity));
  const workload = Math.max(0, input.vehicleWorkload, input.riderWorkload);
  return Math.max(0, capacity - workload);
}
