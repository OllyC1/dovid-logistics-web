const PLACEHOLDER_REGISTRATION = /^PENDING(?:[- ]|$)/i;

export function isRealVehicleRegistration(value: string | null | undefined): value is string {
  const registration = value?.trim();
  return Boolean(registration && !PLACEHOLDER_REGISTRATION.test(registration));
}

export type VehicleRegistrationEvidence = {
  registration_number: string | null;
  registration_verified_at: string | null;
  manufacturer: string | null;
  model: string | null;
  model_year: number | null;
};

export function hasVerifiedVehicleRegistration(vehicle: VehicleRegistrationEvidence) {
  return Boolean(
    isRealVehicleRegistration(vehicle.registration_number)
    && vehicle.registration_verified_at
    && vehicle.manufacturer?.trim()
    && vehicle.model?.trim()
    && vehicle.model_year,
  );
}
