import { describe, expect, it } from "vitest";
import { isRealVehicleRegistration } from "@/features/fleet/registration";

describe("fleet registration identity", () => {
  it("accepts a recorded physical plate", () => {
    expect(isRealVehicleRegistration("ABC 123 XY")).toBe(true);
  });

  it("rejects missing and seeded placeholder registrations", () => {
    expect(isRealVehicleRegistration(null)).toBe(false);
    expect(isRealVehicleRegistration(" ")).toBe(false);
    expect(isRealVehicleRegistration("PENDING-BIKE-01")).toBe(false);
    expect(isRealVehicleRegistration("pending bike 2")).toBe(false);
  });
});
