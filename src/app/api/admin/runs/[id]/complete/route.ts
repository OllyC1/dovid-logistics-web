import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getDispatchManagerAuthorization as getAuthenticatedRole } from "@/lib/auth/staff";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const schema = z.object({ reason: z.string().trim().min(8).max(1_000), idempotencyKey: z.uuid() });

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthenticatedRole();
  if (auth?.role !== "admin") return NextResponse.json({ error: "Admin authorization required" }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Record why this run is ready to close." }, { status: 400 });
  const { id } = await params;
  const { error } = await createSupabaseAdminClient().rpc("complete_delivery_run", { target_run_id: id, actor_id: auth.user.id, completion_reason: parsed.data.reason, request_idempotency_key: parsed.data.idempotencyKey });
  if (error) return NextResponse.json({ error: error.message }, { status: 409 });
  return NextResponse.json({ status: "completed" });
}
