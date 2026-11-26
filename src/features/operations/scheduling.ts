export type DailyHours = [string, string] | null;
export type OperatingSchedule = {
  timezone: string;
  monday: DailyHours;
  tuesday: DailyHours;
  wednesday: DailyHours;
  thursday: DailyHours;
  friday: DailyHours;
  saturday: DailyHours;
  sunday: DailyHours;
};

type LocalParts = { dateKey: string; weekday: keyof Omit<OperatingSchedule, "timezone">; minutes: number };

function minutes(value: string) {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

export function localOperatingParts(date: Date, timezone = "Africa/Lagos"): LocalParts {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    weekday: "long",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return {
    dateKey: `${value("year")}-${value("month")}-${value("day")}`,
    weekday: value("weekday").toLowerCase() as LocalParts["weekday"],
    minutes: Number(value("hour")) * 60 + Number(value("minute")),
  };
}

export type ScheduleDecision = "same_day_eligible" | "future_schedule" | "manual_review" | "closed";

export function evaluateOperatingSchedule(input: {
  now: Date;
  requestedAt: Date;
  schedule: OperatingSchedule;
  sameDayCutoff: string;
  routeDurationSeconds: number;
  handoverBufferMinutes: number | null;
  safeCompletionBufferMinutes: number | null;
  maximumContinuousRidingMinutes: number | null;
  minimumBreakMinutes: number | null;
  riderAvailable: boolean;
}) {
  const now = localOperatingParts(input.now, input.schedule.timezone);
  const requested = localOperatingParts(input.requestedAt, input.schedule.timezone);
  const hours = input.schedule[requested.weekday];
  if (!hours) return { decision: "closed" as const, reason: "service_closed" };
  const [opensAt, closesAt] = hours.map(minutes);
  if (requested.minutes < opensAt || requested.minutes >= closesAt) {
    return { decision: "future_schedule" as const, reason: "outside_operating_hours" };
  }
  if (input.handoverBufferMinutes === null || input.safeCompletionBufferMinutes === null) {
    return { decision: "manual_review" as const, reason: "completion_buffers_unconfigured" };
  }
  if (input.maximumContinuousRidingMinutes === null || input.minimumBreakMinutes === null) {
    return { decision: "manual_review" as const, reason: "rider_rest_rules_unconfigured" };
  }
  if (Math.ceil(input.routeDurationSeconds / 60) > input.maximumContinuousRidingMinutes) {
    return { decision: "manual_review" as const, reason: "continuous_riding_limit_exceeded" };
  }
  const sameDay = now.dateKey === requested.dateKey;
  if (sameDay && now.minutes >= minutes(input.sameDayCutoff)) {
    return { decision: "future_schedule" as const, reason: "same_day_cutoff_passed" };
  }
  const completionMinutes = requested.minutes + Math.ceil(input.routeDurationSeconds / 60) + input.handoverBufferMinutes + input.safeCompletionBufferMinutes;
  if (completionMinutes > closesAt) return { decision: "future_schedule" as const, reason: "unsafe_completion_after_close" };
  if (!input.riderAvailable) return { decision: "manual_review" as const, reason: "capacity_not_confirmed" };
  return { decision: sameDay ? "same_day_eligible" as const : "future_schedule" as const, reason: sameDay ? "within_operating_window" : "future_operating_period" };
}

