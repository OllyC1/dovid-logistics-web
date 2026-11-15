export type RunParcel = {
  orderId: string;
  weightGrams: number | null;
  volumeMm3: number | null;
  compatibilityTags: string[];
  pickupSequence: number;
  dropoffSequence: number;
  deadlineAt?: Date | null;
  estimatedDropoffAt?: Date | null;
};

export function evaluateRunFeasibility(input: {
  parcels: RunParcel[];
  maxAssignments: number;
  capacityVerified: boolean;
  maxPayloadWeightGrams: number | null;
  maxCargoVolumeMm3: number | null;
}) {
  const issues: string[] = [];
  if (input.parcels.length > input.maxAssignments) issues.push("parcel_count_capacity_exceeded");
  if (input.parcels.length > 1 && !input.capacityVerified) issues.push("vehicle_capacity_not_verified");
  if (input.parcels.some((parcel) => parcel.pickupSequence >= parcel.dropoffSequence)) issues.push("pickup_must_precede_dropoff");
  const totalWeight = input.parcels.reduce((sum, parcel) => sum + (parcel.weightGrams ?? 0), 0);
  const totalVolume = input.parcels.reduce((sum, parcel) => sum + (parcel.volumeMm3 ?? 0), 0);
  if (input.parcels.length > 1 && input.parcels.some((parcel) => parcel.weightGrams === null)) issues.push("package_weight_required");
  if (input.maxPayloadWeightGrams !== null && totalWeight > input.maxPayloadWeightGrams) issues.push("payload_weight_exceeded");
  if (input.maxCargoVolumeMm3 !== null && totalVolume > input.maxCargoVolumeMm3) issues.push("cargo_volume_exceeded");
  if (input.parcels.some((parcel) => parcel.deadlineAt && parcel.estimatedDropoffAt && parcel.estimatedDropoffAt > parcel.deadlineAt)) issues.push("delivery_deadline_conflict");
  return { feasible: issues.length === 0, issues, totalWeightGrams: totalWeight, totalVolumeMm3: totalVolume };
}

