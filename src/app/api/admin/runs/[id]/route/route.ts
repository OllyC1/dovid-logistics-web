import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getAuthenticatedRole } from "@/lib/auth/roles";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const schema = z.object({ stopIds: z.array(z.uuid()).min(1), reason: z.string().trim().min(8).max(1_000), idempotencyKey: z.uuid() });

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthenticatedRole();
  if (auth?.role !== "admin") return NextResponse.json({ error: "Admin authorization required" }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Provide every pending stop and a route-adjustment reason." }, { status: 400 });
  const { id } = await params;
  const admin = createSupabaseAdminClient();
  const { error } = await admin.rpc("reorder_delivery_run_stops", { target_run_id: id, ordered_stop_ids: parsed.data.stopIds, actor_id: auth.user.id, change_reason: parsed.data.reason, request_idempotency_key: parsed.data.idempotencyKey });
  if (error) return NextResponse.json({ error: error.message }, { status: 409 });
  return NextResponse.json({ saved: true, routeRecalculationRequired: true });
}

