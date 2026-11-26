import { describe, expect, it } from "vitest";
import { evaluateOperatingSchedule, type OperatingSchedule } from "@/features/operations/scheduling";

const schedule: OperatingSchedule = { timezone: "Africa/Lagos", monday: ["07:00","22:00"], tuesday: ["07:00","22:00"], wednesday: ["07:00","22:00"], thursday: ["07:00","22:00"], friday: ["07:00","22:00"], saturday: ["07:00","22:00"], sunday: ["07:00","22:00"] };
const base = { schedule, sameDayCutoff: "20:30", routeDurationSeconds: 1_800, handoverBufferMinutes: 15, safeCompletionBufferMinutes: 15, maximumContinuousRidingMinutes: 180, minimumBreakMinutes: 20, riderAvailable: true };

describe("Nigeria operating schedule", () => {
  it("accepts the 7 a.m. operating start", () => {
    expect(evaluateOperatingSchedule({ ...base, now: new Date("2026-11-16T06:00:00Z"), requestedAt: new Date("2026-11-16T06:00:00Z") }).decision).toBe("same_day_eligible");
  });
  it("does not treat the 10 p.m. closing instant as bookable", () => {
    expect(evaluateOperatingSchedule({ ...base, now: new Date("2026-11-16T20:00:00Z"), requestedAt: new Date("2026-11-16T21:00:00Z") })).toMatchObject({ decision: "future_schedule", reason: "outside_operating_hours" });
  });
  it("moves requests after the 20:30 cutoff to a future period", () => {
    expect(evaluateOperatingSchedule({ ...base, now: new Date("2026-11-16T19:31:00Z"), requestedAt: new Date("2026-11-16T19:40:00Z") })).toMatchObject({ decision: "future_schedule", reason: "same_day_cutoff_passed" });
  });
  it("handles a cross-date future booking in Africa/Lagos", () => {
    expect(evaluateOperatingSchedule({ ...base, now: new Date("2026-11-16T20:00:00Z"), requestedAt: new Date("2026-11-17T06:00:00Z") })).toMatchObject({ decision: "future_schedule", reason: "future_operating_period" });
  });
  it("requires manual review when safe-completion buffers are unconfigured", () => {
    expect(evaluateOperatingSchedule({ ...base, handoverBufferMinutes: null, now: new Date("2026-11-16T07:00:00Z"), requestedAt: new Date("2026-11-16T08:00:00Z") }).decision).toBe("manual_review");
  });
  it("requires configured rest rules and reviews a route above the continuous-riding limit", () => {
    expect(evaluateOperatingSchedule({ ...base, minimumBreakMinutes: null, now: new Date("2026-11-16T07:00:00Z"), requestedAt: new Date("2026-11-16T08:00:00Z") })).toMatchObject({ decision: "manual_review", reason: "rider_rest_rules_unconfigured" });
    expect(evaluateOperatingSchedule({ ...base, routeDurationSeconds: 181 * 60, now: new Date("2026-11-16T07:00:00Z"), requestedAt: new Date("2026-11-16T08:00:00Z") })).toMatchObject({ decision: "manual_review", reason: "continuous_riding_limit_exceeded" });
  });
});

