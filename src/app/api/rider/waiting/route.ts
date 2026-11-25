import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getAuthenticatedRole } from "@/lib/auth/roles";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const schema = z.object({ orderId: z.uuid(), runId: z.uuid().nullable().optional(), idempotencyKey: z.uuid() });

export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedRole();
  if (!auth || auth.role !== "rider") return NextResponse.json({ error: "Rider authorization required" }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid waiting session" }, { status: 400 });
  const admin = createSupabaseAdminClient();
  const { data: order } = await admin.from("delivery_orders").select("id,rider_id,pickup_zone_id,delivery_status").eq("id", parsed.data.orderId).maybeSingle();
  if (!order || order.rider_id !== auth.user.id) return NextResponse.json({ error: "Order is not assigned to this rider" }, { status: 403 });
  if (order.delivery_status !== "arrived_at_destination") return NextResponse.json({ error: "Waiting begins automatically only after arrival is recorded." }, { status: 409 });
  const { data: existing } = await admin.from("delivery_waiting_sessions").select("id,started_at,status").eq("order_id", order.id).in("status", ["running", "paused"]).maybeSingle();
  if (existing) return NextResponse.json(existing);
  const { data: zone } = order.pickup_zone_id ? await admin.from("service_zones").select("service_area_id").eq("id", order.pickup_zone_id).maybeSingle() : { data: null };
  const { data: settings } = zone ? await admin.from("service_area_operational_settings").select("waiting_free_minutes,waiting_fee_per_minute_kobo").eq("service_area_id", zone.service_area_id).maybeSingle() : { data: null };
  const { data, error } = await admin.from("delivery_waiting_sessions").insert({ order_id: order.id, run_id: parsed.data.runId ?? null, rider_id: auth.user.id, free_waiting_minutes_snapshot: settings?.waiting_free_minutes ?? null, fee_per_minute_kobo_snapshot: settings?.waiting_fee_per_minute_kobo ?? null, idempotency_key: parsed.data.idempotencyKey }).select("id,started_at,status").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 409 });
  return NextResponse.json(data, { status: 201 });
}

