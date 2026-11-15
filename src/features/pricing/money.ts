export function assertSafeInteger(value: number, name: string) {
  if (!Number.isSafeInteger(value)) throw new Error(`${name} must be a safe integer`);
}

export function ceilDivide(numerator: number, denominator: number) {
  assertSafeInteger(numerator, "numerator");
  assertSafeInteger(denominator, "denominator");
  if (denominator <= 0 || numerator < 0) throw new Error("Invalid division operands");
  return Math.floor((numerator + denominator - 1) / denominator);
}

export function applyBasisPoints(amountKobo: number, basisPoints: number) {
  assertSafeInteger(amountKobo, "amountKobo");
  assertSafeInteger(basisPoints, "basisPoints");
  return ceilDivide(amountKobo * basisPoints, 10_000);
}

export function roundUpToIncrement(amountKobo: number, incrementKobo: number) {
  return ceilDivide(amountKobo, incrementKobo) * incrementKobo;
}

export function medianKobo(values: number[]) {
  if (!values.length) throw new Error("Median requires values");
  values.forEach((value) => assertSafeInteger(value, "competitor quote"));
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : ceilDivide(sorted[middle - 1] + sorted[middle], 2);
}
