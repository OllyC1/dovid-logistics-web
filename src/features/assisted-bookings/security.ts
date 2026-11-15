import { createHash, randomBytes, randomInt } from "node:crypto";

export function hashAssistedSecret(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function createAssistedAccessSecrets() {
  const token = randomBytes(32).toString("base64url");
  const otp = String(randomInt(0, 1_000_000)).padStart(6, "0");
  return { token, tokenHash: hashAssistedSecret(token), otp, otpHash: hashAssistedSecret(otp) };
}

