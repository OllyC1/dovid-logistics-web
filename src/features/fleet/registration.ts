const PLACEHOLDER_REGISTRATION = /^PENDING(?:[- ]|$)/i;

export function isRealVehicleRegistration(value: string | null | undefined): value is string {
  const registration = value?.trim();
  return Boolean(registration && !PLACEHOLDER_REGISTRATION.test(registration));
}
