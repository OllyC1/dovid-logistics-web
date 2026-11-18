import { describe, expect, it } from "vitest";
import { attemptResolutionSchema } from "@/app/api/admin/attempts/[id]/resolve/route";

const base = {
  attributableTo: "under_review",
  reason: "Dispatch verified the operational evidence.",
  idempotencyKey: "78d5b118-17de-4adb-b947-c39f8eb499b0",
} as const;

describe("attempt resolution API validation", () => {
  it("requires a future date for scheduled redelivery", () => {
    expect(attemptResolutionSchema.safeParse({ ...base, resolution: "schedule_redelivery" }).success).toBe(false);
    expect(attemptResolutionSchema.safeParse({ ...base, resolution: "schedule_redelivery", scheduledAt: new Date(Date.now() - 60_000).toISOString() }).success).toBe(false);
    expect(attemptResolutionSchema.safeParse({ ...base, resolution: "schedule_redelivery", scheduledAt: new Date(Date.now() + 60 * 60_000).toISOString() }).success).toBe(true);
  });

  it("requires verified coordinates with a corrected address", () => {
    expect(attemptResolutionSchema.safeParse({ ...base, resolution: "correct_address", correctedAddress: "12 Ring Road, Ibadan" }).success).toBe(false);
    expect(attemptResolutionSchema.safeParse({ ...base, resolution: "correct_address", correctedAddress: "12 Ring Road, Ibadan", correctedLatitude: 7.36, correctedLongitude: 3.875 }).success).toBe(true);
  });

  it("accepts non-location resolutions without fabricated address data", () => {
    expect(attemptResolutionSchema.safeParse({ ...base, resolution: "return_to_sender", attributableTo: "customer" }).success).toBe(true);
    expect(attemptResolutionSchema.safeParse({ ...base, resolution: "open_incident" }).success).toBe(true);
  });
});
