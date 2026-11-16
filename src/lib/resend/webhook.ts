import { createHmac, timingSafeEqual } from "node:crypto";

const toleranceSeconds = 5 * 60;

export function verifyResendWebhook(input: { payload: string; id: string | null; timestamp: string | null; signature: string | null; secret: string; nowSeconds?: number }) {
  if (!input.id || !input.timestamp || !input.signature || !input.secret.startsWith("whsec_")) return false;
  const timestamp = Number(input.timestamp);
  const now = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (!Number.isFinite(timestamp) || Math.abs(now - timestamp) > toleranceSeconds) return false;
  let secret: Buffer;
  try { secret = Buffer.from(input.secret.slice(6), "base64"); } catch { return false; }
  const expected = createHmac("sha256", secret).update(`${input.id}.${input.timestamp}.${input.payload}`).digest();
  return input.signature.split(" ").some((candidate) => {
    const [version, encoded] = candidate.split(",", 2);
    if (version !== "v1" || !encoded) return false;
    try { const received = Buffer.from(encoded, "base64"); return received.length === expected.length && timingSafeEqual(received, expected); } catch { return false; }
  });
}
