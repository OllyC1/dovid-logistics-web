import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { assistedBookingDraftSchema } from "@/features/assisted-bookings/schema";
import { getBookingsManagerAuthorization as getAuthenticatedRole } from "@/lib/auth/staff";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const schema = assistedBookingDraftSchema.extend({ idempotencyKey: z.uuid() });

export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedRole();
  if (auth?.role !== "admin") return NextResponse.json({ error: "Admin authorization required" }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Please complete the assisted booking details.", issues: parsed.error.flatten() }, { status: 400 });
  const admin = createSupabaseAdminClient();
  const { idempotencyKey, ...payload } = parsed.data;
  const { data: existing } = await admin.from("assisted_booking_drafts").select("id,status,quote_id").eq("idempotency_key", idempotencyKey).maybeSingle();
  if (existing) return NextResponse.json(existing);
  const { data, error } = await admin.from("assisted_booking_drafts").insert({
    booking_origin: payload.bookingOrigin,
    customer_name: payload.customerName,
    customer_phone: payload.customerPhone,
    phone_source: payload.phoneSource,
    request_payload: payload,
    created_by: auth.user.id,
    idempotency_key: idempotencyKey,
  }).select("id,status,created_at").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 409 });
  await admin.from("assisted_booking_events").insert({ draft_id: data.id, event_type: "draft_created", actor_id: auth.user.id, actor_type: "admin", metadata: { bookingOrigin: payload.bookingOrigin } });
  return NextResponse.json(data, { status: 201 });
}

