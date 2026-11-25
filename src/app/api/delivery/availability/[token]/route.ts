import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { hashAssistedSecret } from "@/features/assisted-bookings/security";
import { publicBookingsEnabled } from "@/lib/launch-controls";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const tokenSchema = z.string().min(32).max(200).regex(/^[A-Za-z0-9_-]+$/);
const allowedPayloadKeys = [
  "pickupAddress", "pickupCoordinates", "deliveryAddress", "deliveryCoordinates",
  "packageCategory", "packageSize", "packageDescription", "serviceLevel", "paymentMethod",
  "additionalStops", "oversized", "payer", "scheduledAt", "senderName", "senderPhone",
  "notificationEmail", "recipientName", "recipientPhone", "promotionCode"
] as const;

export async function GET(_request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  if (!publicBookingsEnabled()) return NextResponse.json({ error: "Online bookings are not open yet." }, { status: 503 });
  const parsed = tokenSchema.safeParse((await params).token);
  if (!parsed.success) return NextResponse.json({ error: "This continuation link is not valid." }, { status: 404 });
  const admin = createSupabaseAdminClient();
  const { data: access } = await admin.from("availability_request_access_tokens")
    .select("id,availability_request_id,expires_at")
    .eq("token_hash", hashAssistedSecret(parsed.data))
    .maybeSingle();
  if (!access || new Date(access.expires_at) <= new Date()) return NextResponse.json({ error: "This continuation link has expired. Please contact dispatch with your request reference." }, { status: 410 });
  const { data: availability } = await admin.from("delivery_availability_requests")
    .select("reference_code,status,review_reason,request_payload")
    .eq("id", access.availability_request_id)
    .maybeSingle();
  if (!availability) return NextResponse.json({ error: "This delivery request is no longer available." }, { status: 404 });
  await admin.from("availability_request_access_tokens").update({ last_used_at: new Date().toISOString() }).eq("id", access.id);
  const stored = (availability.request_payload ?? {}) as Record<string, unknown>;
  const requestPayload = Object.fromEntries(allowedPayloadKeys.filter((key) => key in stored).map((key) => [key, stored[key]]));
  return NextResponse.json({ reference: availability.reference_code, status: availability.status, reviewReason: availability.review_reason, requestPayload }, { headers: { "Cache-Control": "no-store" } });
}
