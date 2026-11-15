import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getAuthenticatedRole } from "@/lib/auth/roles";
import { optimizeRunRoute, type RunRouteStop } from "@/lib/maps/routes";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const schema = z.object({ orderId: z.uuid(), idempotencyKey: z.uuid(), overrideReason: z.string().trim().min(8).max(1_000).optional() });

function durationSeconds(duration: string | undefined) {
  const match = duration?.match(/^(\d+(?:\.\d+)?)s$/);
  if (!match) throw new Error("Routing provider returned an invalid duration");
  return Math.ceil(Number(match[1]));
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthenticatedRole();
  if (auth?.role !== "admin") return NextResponse.json({ error: "Admin authorization required" }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Choose an order for this run." }, { status: 400 });
  const { id } = await params;
  const admin = createSupabaseAdminClient();
  const [{ data: run }, { data: order }, { data: existingStops }, { data: deliveryPackage }] = await Promise.all([
    admin.from("delivery_runs").select("id,vehicle_id,scheduled_start_at,estimated_profit_kobo,fleet_vehicles(current_latitude,current_longitude)").eq("id", id).maybeSingle(),
    admin.from("delivery_orders").select("id,quote_id,pickup_latitude,pickup_longitude,delivery_latitude,delivery_longitude").eq("id", parsed.data.orderId).maybeSingle(),
    admin.from("delivery_run_stops").select("id,order_id,stop_type,latitude,longitude,deadline_at").eq("run_id", id).in("status", ["pending", "next"]).order("sequence"),
    admin.from("delivery_packages").select("delivery_deadline").eq("order_id", parsed.data.orderId).maybeSingle(),
  ]);
  if (!run || !order) return NextResponse.json({ error: "Run or order not found" }, { status: 404 });
  const vehicle = Array.isArray(run.fleet_vehicles) ? run.fleet_vehicles[0] : run.fleet_vehicles;
  if (vehicle?.current_latitude === null || vehicle?.current_longitude === null || vehicle?.current_latitude === undefined || vehicle?.current_longitude === undefined) return NextResponse.json({ error: "Record the bike location before route optimization." }, { status: 409 });
  const stops: RunRouteStop[] = [
    ...(existingStops ?? []).filter((stop) => stop.latitude !== null && stop.longitude !== null && (stop.stop_type === "pickup" || stop.stop_type === "dropoff")).map((stop) => ({ id: stop.id, orderId: stop.order_id!, type: stop.stop_type as "pickup" | "dropoff", latitude: Number(stop.latitude), longitude: Number(stop.longitude), deadlineAt: stop.deadline_at })),
    { id: `pickup:${order.id}`, orderId: order.id, type: "pickup", latitude: Number(order.pickup_latitude), longitude: Number(order.pickup_longitude) },
    { id: `dropoff:${order.id}`, orderId: order.id, type: "dropoff", latitude: Number(order.delivery_latitude), longitude: Number(order.delivery_longitude), deadlineAt: deliveryPackage?.delivery_deadline },
  ];
  try {
    const route = await optimizeRunRoute({ latitude: Number(vehicle.current_latitude), longitude: Number(vehicle.current_longitude) }, stops);
    const routeDurationSeconds = durationSeconds(route.duration);
    const startsAt = Math.max(Date.now(), run.scheduled_start_at ? new Date(run.scheduled_start_at).getTime() : 0);
    let elapsedSeconds = 0;
    const suggestedStops = route.stops.map((stop, index) => {
      elapsedSeconds += durationSeconds(route.legs?.[index]?.duration ?? (index === route.stops.length - 1 ? route.duration : "0s"));
      const estimatedArrivalAt = new Date(startsAt + elapsedSeconds * 1_000).toISOString();
      return { ...stop, sequence: index + 1, estimatedArrivalAt, deadlineConflict: Boolean(stop.deadlineAt && new Date(estimatedArrivalAt) > new Date(stop.deadlineAt)) };
    });
    const { data: profit } = await admin.from("quote_cost_estimates").select("estimated_profit_kobo").eq("quote_id", order.quote_id).maybeSingle();
    const routeSnapshot = { provider: route.provider, distanceMeters: route.distanceMeters, duration: route.duration, durationSeconds: routeDurationSeconds, expectedCompletionAt: new Date(startsAt + routeDurationSeconds * 1_000).toISOString(), suggestedStops, deadlineConflict: suggestedStops.some((stop) => stop.deadlineConflict), estimatedProfitKobo: (run.estimated_profit_kobo ?? 0) + (profit?.estimated_profit_kobo ?? 0) };
    const { data, error } = await admin.rpc("assign_order_to_delivery_run", { target_order_id: order.id, target_run_id: id, actor_id: auth.user.id, route_snapshot: routeSnapshot, override_reason: parsed.data.overrideReason ?? null, request_idempotency_key: parsed.data.idempotencyKey });
    if (error) return NextResponse.json({ error: error.message }, { status: 409 });
    return NextResponse.json({ runAssignmentId: data, route: routeSnapshot }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Run route could not be evaluated" }, { status: 409 });
  }
}

