import { describe, expect, it } from "vitest";
import { calculateWaitingCharge } from "@/features/operations/waiting";

describe("server-authoritative waiting charges", () => {
  it("charges only whole commenced minutes after the free period", () => {
    expect(calculateWaitingCharge({ startedAt: new Date("2026-11-14T10:00:00Z"), endedAt: new Date("2026-11-14T10:12:01Z"), excludedSeconds: 0, freeWaitingMinutes: 10, feePerMinuteKobo: 100 })).toMatchObject({ billableMinutes: 3, chargeKobo: 300 });
  });
  it("excludes delays caused by Dovid or the rider", () => {
    expect(calculateWaitingCharge({ startedAt: new Date("2026-11-14T10:00:00Z"), endedAt: new Date("2026-11-14T10:15:00Z"), excludedSeconds: 300, freeWaitingMinutes: 10, feePerMinuteKobo: 100 })).toMatchObject({ billableMinutes: 0, chargeKobo: 0 });
  });
  it("does not invent a charge when pricing is unconfigured", () => {
    expect(calculateWaitingCharge({ startedAt: new Date("2026-11-14T10:00:00Z"), endedAt: new Date("2026-11-14T10:20:00Z"), excludedSeconds: 0, freeWaitingMinutes: null, feePerMinuteKobo: null }).chargeKobo).toBeNull();
  });
});

