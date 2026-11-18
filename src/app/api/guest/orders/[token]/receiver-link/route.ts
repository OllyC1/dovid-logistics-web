import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { hashAssistedSecret } from "@/features/assisted-bookings/security";
import { takeRateLimit } from "@/lib/server/rate-limit";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const rateLimit = takeRateLimit(request, "guest-receiver-link", 6, 10 * 60_000);
  if (rateLimit.limited) return NextResponse.json({ error: "Too many link requests. Please wait a few minutes." }, { status: 429 });
  const { token } = await params;
  if (token.length < 40 || token.length > 128) return NextResponse.json({ error: "Invalid secure delivery link." }, { status: 400 });

  const admin = createSupabaseAdminClient();
  const { data: access } = await admin.from("guest_order_access_tokens")
    .select("id,order_id,expires_at,revoked_at")
    .eq("token_hash", hashAssistedSecret(token))
    .maybeSingle();
  if (!access || access.revoked_at || new Date(access.expires_at) <= new Date()) {
    return NextResponse.json({ error: "This secure delivery link is invalid or has expired." }, { status: 410 });
  }

  const { data: order } = await admin.from("delivery_orders")
    .select("id,payer,payment_status,delivery_status,customer_id,assisted_booking_draft_id,guest_booking")
    .eq("id", access.order_id)
    .maybeSingle();
  if (!order || order.customer_id || (!order.assisted_booking_draft_id && !order.guest_booking)) return NextResponse.json({ error: "Guest delivery not found." }, { status: 404 });
  if (["cancelled", "delivered"].includes(order.delivery_status)) return NextResponse.json({ error: "This delivery can no longer accept payment." }, { status: 409 });
  if (order.payer === "sender") return NextResponse.json({ error: "The sender is paying for this delivery." }, { status: 409 });
  if (order.payment_status === "paid") return NextResponse.json({ error: "This delivery is already paid." }, { status: 409 });

  const receiverToken = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 48 * 60 * 60_000).toISOString();
  const { error: tokenError } = await admin.rpc("issue_guest_receiver_payment_token", {
    guest_access_token_hash: hashAssistedSecret(token),
    new_receiver_token_hash: hashAssistedSecret(receiverToken),
    new_expires_at: expiresAt,
  });
  if (tokenError) return NextResponse.json({ error: "The receiver payment link could not be prepared." }, { status: 503 });
  return NextResponse.json({ receiverToken, expiresAt }, { headers: { "Cache-Control": "no-store" } });
}
