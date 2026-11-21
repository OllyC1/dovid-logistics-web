import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { hashAssistedSecret } from "@/features/assisted-bookings/security";
import { bookingSchema } from "@/features/orders/validation";
import { publicBookingsEnabled } from "@/lib/launch-controls";
import { takeRateLimit } from "@/lib/server/rate-limit";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  if (!publicBookingsEnabled()) return NextResponse.json({ error: "Online bookings are not open yet. Please contact Dovid Logistics for help." }, { status: 503 });
  const parsed = bookingSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid booking", issues: parsed.error.flatten() }, { status: 400 });
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user && !parsed.data.guestBooking) {
      const { data, error } = await supabase.rpc("create_delivery_order", { booking_payload: parsed.data });
      if (error) throw error;
      const orderId = (data as Record<string, unknown> | null)?.order_id;
      if (typeof orderId === "string") {
        const admin = createSupabaseAdminClient();
        const { error: contactError } = await admin.from("delivery_orders").update({ notification_email: parsed.data.notificationEmail.toLowerCase(), updated_at: new Date().toISOString() }).eq("id", orderId);
        if (contactError) throw contactError;
        const { error: dispatchError } = await admin.rpc("auto_assign_delivery_order", { target_order_id: orderId });
        if (dispatchError) throw dispatchError;
      }
      return NextResponse.json(data, { status: 201 });
    }
    const rateLimit = takeRateLimit(request, "guest-order-create", 8, 10 * 60_000);
    if (rateLimit.limited) return NextResponse.json({ error: "Too many booking attempts. Please wait a few minutes and try again." }, { status: 429 });
    if (!parsed.data.guestQuoteToken) return NextResponse.json({ error: "This secure price has expired. Please request a new price." }, { status: 401 });
    const guestAccessToken = randomBytes(32).toString("base64url");
    const guestAccessExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60_000).toISOString();
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin.rpc("create_guest_delivery_order", {
      booking_payload: parsed.data,
      guest_quote_token_hash: hashAssistedSecret(parsed.data.guestQuoteToken),
      guest_access_token_hash: hashAssistedSecret(guestAccessToken),
      guest_access_expires_at: guestAccessExpiresAt,
    });
    if (error) throw error;
    const orderId = (data as Record<string, unknown> | null)?.order_id;
    if (typeof orderId === "string") {
      const { error: contactError } = await admin.from("delivery_orders").update({ notification_email: parsed.data.notificationEmail.toLowerCase(), updated_at: new Date().toISOString() }).eq("id", orderId);
      if (contactError) throw contactError;
      const { error: dispatchError } = await admin.rpc("auto_assign_delivery_order", { target_order_id: orderId });
      if (dispatchError) throw dispatchError;
    }
    return NextResponse.json({
      ...(data as Record<string, unknown>),
      guest_access_token: guestAccessToken,
      guest_order_url: `/guest/orders/${guestAccessToken}`,
    }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Booking could not be created" }, { status: 400 }); }
}
