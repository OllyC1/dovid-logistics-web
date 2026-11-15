export function calculateWaitingCharge(input: {
  startedAt: Date;
  endedAt: Date;
  excludedSeconds: number;
  freeWaitingMinutes: number | null;
  feePerMinuteKobo: number | null;
}) {
  if (input.endedAt < input.startedAt) throw new Error("Waiting session cannot end before arrival");
  if (input.freeWaitingMinutes === null || input.feePerMinuteKobo === null) {
    return { chargeKobo: null, billableMinutes: null, reason: "waiting_pricing_unconfigured" };
  }
  const elapsedSeconds = Math.max(0, Math.floor((input.endedAt.getTime() - input.startedAt.getTime()) / 1000) - Math.max(0, input.excludedSeconds));
  const billableSeconds = Math.max(0, elapsedSeconds - input.freeWaitingMinutes * 60);
  const billableMinutes = Math.ceil(billableSeconds / 60);
  return { chargeKobo: billableMinutes * input.feePerMinuteKobo, billableMinutes, reason: billableMinutes ? "waiting_charge_calculated" : "within_free_waiting_period" };
}

