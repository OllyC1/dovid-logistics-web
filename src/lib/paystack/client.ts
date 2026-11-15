import { createHmac, timingSafeEqual } from "node:crypto";
import { requireServerEnv } from "@/lib/env";
import { assertPaystackKeyIsAllowed, livePaymentsEnabled } from "@/lib/launch-controls";

export type PaystackTransaction = {
  id: number;
  domain: "test" | "live";
  status: string;
  reference: string;
  amount: number;
  currency: string;
  metadata?: Record<string, unknown> | string;
};

function getSecretKey() {
  const secretKey = requireServerEnv("PAYSTACK_SECRET_KEY");
  assertPaystackKeyIsAllowed(secretKey);
  return secretKey;
}

function validateProviderMode(domain: string) {
  if (!livePaymentsEnabled() && domain !== "test") throw new Error("Live Paystack payments are disabled");
}

function validateCheckoutUrl(value: string) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.hostname !== "checkout.paystack.com") throw new Error("Payment provider returned an invalid checkout URL");
}

export async function initializePaystackPayment(input: { email: string; amountMinor: number; reference: string; callbackUrl: string; metadata: Record<string, unknown>; channels?: string[] }) {
  const response = await fetch("https://api.paystack.co/transaction/initialize", {
    method: "POST",
    headers: { Authorization: `Bearer ${getSecretKey()}`, "Content-Type": "application/json" },
    body: JSON.stringify({ email: input.email, amount: input.amountMinor, reference: input.reference, callback_url: input.callbackUrl, metadata: input.metadata, channels: input.channels }),
    cache: "no-store"
  });
  const body = await response.json();
  if (!response.ok || !body.status || body.data?.reference !== input.reference || typeof body.data?.authorization_url !== "string") throw new Error("Payment provider could not start checkout");
  validateCheckoutUrl(body.data.authorization_url);
  return body.data as { authorization_url: string; access_code: string; reference: string };
}

export async function verifyPaystackTransaction(reference: string) {
  if (!/^[A-Za-z0-9._-]{6,120}$/.test(reference)) throw new Error("Invalid payment reference");
  const response = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: { Authorization: `Bearer ${getSecretKey()}` },
    cache: "no-store"
  });
  const body = await response.json();
  if (!response.ok || !body.status || !body.data) throw new Error("Payment provider could not verify this transaction");
  const transaction = body.data as PaystackTransaction;
  validateProviderMode(transaction.domain);
  return transaction;
}

function safeHexEqual(expected: Buffer, provided: string) {
  if (!/^[0-9a-f]{128}$/.test(provided)) return false;
  const actual = Buffer.from(provided, "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function verifyPaystackWebhookSignature(rawBody: string, headers: { paystackSignature: string | null; legacySignature: string | null }, nowSeconds = Math.floor(Date.now() / 1000)) {
  if (headers.paystackSignature) {
    const parts = headers.paystackSignature.split(",");
    const timestampValues = parts.filter(part => part.trim().startsWith("t=")).map(part => part.trim().slice(2));
    const signatures = parts.filter(part => part.trim().startsWith("v1=")).map(part => part.trim().slice(3)).filter(value => /^whk_[^:]+:[0-9a-f]{128}$/.test(value)).map(value => value.slice(value.indexOf(":") + 1));
    if (timestampValues.length === 1 && /^\d+$/.test(timestampValues[0]) && Math.abs(nowSeconds - Number(timestampValues[0])) <= 300) {
      const secrets = [process.env.PAYSTACK_WEBHOOK_SECRET, process.env.PAYSTACK_WEBHOOK_SECRET_PREVIOUS].filter((value): value is string => Boolean(value?.startsWith("whsec_")));
      const timestampedSignatureValid = secrets.some(secret => {
        const expected = createHmac("sha512", secret).update(`${timestampValues[0]}.${rawBody}`).digest();
        return signatures.some(signature => safeHexEqual(expected, signature));
      });
      if (timestampedSignatureValid) return true;
    }
  }
  if (!headers.legacySignature) return false;
  const secretKey = process.env.PAYSTACK_SECRET_KEY;
  if (!secretKey) return false;
  assertPaystackKeyIsAllowed(secretKey);
  return safeHexEqual(createHmac("sha512", secretKey).update(rawBody).digest(), headers.legacySignature);
}
