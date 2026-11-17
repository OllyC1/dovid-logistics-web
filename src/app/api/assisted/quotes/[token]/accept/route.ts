import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { hashAssistedSecret } from "@/features/assisted-bookings/security";
import { assistedBookingsEnabled } from "@/lib/launch-controls";
import { takeRateLimit } from "@/lib/server/rate-limit";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const schema = z.object({
  payer: z.enum(["sender", "receiver_before_delivery", "receiver_at_delivery"]),
  termsAccepted: z.literal(true),
  termsVersion: z.string().min(1).max(50),
  idempotencyKey: z.uuid(),
});

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  if (!assistedBookingsEnabled()) return NextResponse.json({ error: "Assisted order confirmation is not open yet." }, { status: 503 });
  const rateLimit = takeRateLimit(request, "assisted-guest-accept", 8, 10 * 60_000);
  if (rateLimit.limited) return NextResponse.json({ error: "Too many attempts. Please wait a few minutes and try again." }, { status: 429 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Confirm the payer and accept the terms." }, { status: 400 });
  const { token } = await params;
  const verificationSession = (await cookies()).get("dovid_assisted_verification")?.value;
  if (!verificationSession) return NextResponse.json({ error: "Verify the contact code again." }, { status: 403 });
  const admin = createSupabaseAdminClient();
  const tokenHash = hashAssistedSecret(token);
  const guestAccessToken = randomBytes(32).toString("base64url");
  const guestAccessExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60_000).toISOString();
  const { data: accepted, error: acceptanceError } = await admin.rpc("accept_assisted_guest_quote", {
    access_token_hash: tokenHash,
    verification_session_hash: hashAssistedSecret(verificationSession),
    selected_payer: parsed.data.payer,
    acceptance_idempotency: parsed.data.idempotencyKey,
    acceptance_evidence: { termsAccepted: true, termsVersion: parsed.data.termsVersion, acceptedAt: new Date().toISOString(), source: "secure_assisted_guest_quote" },
    guest_access_token_hash: hashAssistedSecret(guestAccessToken),
    guest_access_expires_at: guestAccessExpiresAt,
  });
  if (acceptanceError) return NextResponse.json({ error: acceptanceError.message }, { status: 409 });
  const order = accepted as { order_id: string; order_reference: string; tracking_reference: string; payment_status: string; receiver_payment_token?: string | null };
  const response = NextResponse.json({
    order,
    guestAccessToken,
    guestOrderUrl: `/guest/orders/${guestAccessToken}`,
    paymentRequired: order.payment_status !== "paid",
  }, { status: 201, headers: { "Cache-Control": "no-store" } });
  response.cookies.delete("dovid_assisted_verification");
  return response;
}

