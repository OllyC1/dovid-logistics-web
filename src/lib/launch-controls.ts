export function publicBookingsEnabled() {
  return process.env.ENABLE_PUBLIC_BOOKINGS === "true";
}

export function livePaymentsEnabled() {
  return process.env.ENABLE_LIVE_PAYMENTS === "true";
}

export function assistedBookingsEnabled() {
  return process.env.ENABLE_ASSISTED_BOOKINGS === "true";
}

export function assertPaystackKeyIsAllowed(secretKey: string) {
  if (!livePaymentsEnabled() && !secretKey.startsWith("sk_test_")) throw new Error("A Paystack test secret key is required while live payments are disabled");
}
