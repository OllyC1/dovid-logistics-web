import { remainingDispatchSlots } from "@/features/dispatch/capacity";
import { isRealVehicleRegistration } from "@/features/fleet/registration";

type ReadinessVehicle = {
  id: string;
  registration_number: string | null;
  operational_status: string;
  safety_status: string;
  assigned_rider_id: string | null;
  max_active_assignments: number;
  capacity_verified_at: string | null;
};

type ActiveAssignment = {
  vehicle_id: string;
  rider_id: string;
};

export type DispatchReadiness = {
  activeNamedRiders: number;
  readyMotorcycles: number;
  totalMotorcycles: number;
  availableParcelSlots: number;
  riderParcelLimit: number;
  scheduleBuffersConfigured: boolean;
  automaticCapacityAvailable: boolean;
};

export function assessDispatchReadiness(input: {
  vehicles: ReadinessVehicle[];
  activeNamedRiderIds: string[];
  activeAssignments: ActiveAssignment[];
  riderParcelLimit: number;
  handoverBufferMinutes: number | null;
  safeCompletionBufferMinutes: number | null;
}): DispatchReadiness {
  const activeRiderIds = new Set(input.activeNamedRiderIds);
  const vehicleWorkload = new Map<string, number>();
  const riderWorkload = new Map<string, number>();

  for (const assignment of input.activeAssignments) {
    vehicleWorkload.set(assignment.vehicle_id, (vehicleWorkload.get(assignment.vehicle_id) ?? 0) + 1);
    riderWorkload.set(assignment.rider_id, (riderWorkload.get(assignment.rider_id) ?? 0) + 1);
  }

  const readyVehicles = input.vehicles.filter((vehicle) => (
    isRealVehicleRegistration(vehicle.registration_number)
    && ["available", "assigned"].includes(vehicle.operational_status)
    && vehicle.safety_status === "cleared"
    && Boolean(vehicle.capacity_verified_at)
    && Boolean(vehicle.assigned_rider_id && activeRiderIds.has(vehicle.assigned_rider_id))
  ));

  const availableParcelSlots = readyVehicles.reduce((total, vehicle) => total + remainingDispatchSlots({
    vehicleCapacity: vehicle.max_active_assignments,
    riderCapacity: input.riderParcelLimit,
    vehicleWorkload: vehicleWorkload.get(vehicle.id) ?? 0,
    riderWorkload: vehicle.assigned_rider_id ? riderWorkload.get(vehicle.assigned_rider_id) ?? 0 : 0,
  }), 0);

  return {
    activeNamedRiders: activeRiderIds.size,
    readyMotorcycles: readyVehicles.length,
    totalMotorcycles: input.vehicles.length,
    availableParcelSlots,
    riderParcelLimit: input.riderParcelLimit,
    scheduleBuffersConfigured: input.handoverBufferMinutes !== null && input.safeCompletionBufferMinutes !== null,
    automaticCapacityAvailable: availableParcelSlots > 0,
  };
}
