import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { scoreDispatchCandidate } from "@/features/dispatch/scoring";
import { getDispatchManagerAuthorization as getAuthenticatedRole } from "@/lib/auth/staff";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const schema = z.object({ orderId: z.uuid(), vehicleId: z.uuid(), riderId: z.uuid(), overrideReason: z.string().trim().min(8).max(1_000).optional() });
function approximateDistanceMeters(left: { latitude: number; longitude: number }, right: { latitude: number; longitude: number }) { const latitude = (left.latitude - right.latitude) * 111_320; const longitude = (left.longitude - right.longitude) * 109_000; return Math.round(Math.hypot(latitude, longitude)); }

export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedRole();
  if (auth?.role !== "admin") return NextResponse.json({ error: "Admin authorization required" }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Choose an order, bike and rider." }, { status: 400 });
  const admin = createSupabaseAdminClient();
  const [{ data: order }, { data: vehicle }, { count: workload }] = await Promise.all([
    admin.from("delivery_orders").select("id,pickup_latitude,pickup_longitude,quotes(duration_seconds)").eq("id", parsed.data.orderId).maybeSingle(),
    admin.from("fleet_vehicles").select("id,operational_status,safety_status,current_latitude,current_longitude,max_active_assignments,assigned_rider_id").eq("id", parsed.data.vehicleId).maybeSingle(),
    admin.from("delivery_assignments").select("id", { count: "exact", head: true }).eq("rider_id", parsed.data.riderId).is("released_at", null)
  ]);
  if (!order || !vehicle) return NextResponse.json({ error: "Order or bike not found." }, { status: 404 });
  const proximityMeters = vehicle.current_latitude === null || vehicle.current_longitude === null ? null : approximateDistanceMeters({ latitude: Number(vehicle.current_latitude), longitude: Number(vehicle.current_longitude) }, { latitude: Number(order.pickup_latitude), longitude: Number(order.pickup_longitude) });
  const quoteRelation = Array.isArray(order.quotes) ? order.quotes[0] : order.quotes;
  const score = scoreDispatchCandidate({ riderId: parsed.data.riderId, vehicleId: vehicle.id, proximityMeters, activeAssignments: workload ?? 0, capacity: vehicle.max_active_assignments, routeDurationSeconds: quoteRelation?.duration_seconds ?? 0, available: vehicle.operational_status === "available", safetyCleared: vehicle.safety_status === "cleared", homeTerritoryMatch: vehicle.assigned_rider_id === parsed.data.riderId });
  if (!score.eligible) return NextResponse.json({ error: "This assignment would exceed current capacity or safety controls." }, { status: 409 });
  const { data: assignmentId, error } = await admin.rpc("assign_delivery_order", { target_order_id: parsed.data.orderId, target_vehicle_id: parsed.data.vehicleId, target_rider_id: parsed.data.riderId, actor_id: auth.user.id, score_snapshot: { ...score, proximityMeters, workload: workload ?? 0 }, override_reason: parsed.data.overrideReason ?? null });
  if (error) return NextResponse.json({ error: error.message }, { status: 409 });
  return NextResponse.json({ assignmentId, score: score.score });
}
