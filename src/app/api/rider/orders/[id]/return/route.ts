import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getAuthenticatedRole } from "@/lib/auth/roles";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const schema = z.object({ recipientName: z.string().trim().min(2).max(120), notes: z.string().trim().max(1_000).optional(), idempotencyKey: z.uuid() });

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthenticatedRole();
  if (!auth || !["rider", "admin"].includes(auth.role)) return NextResponse.json({ error: "Rider authorization required" }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Record who accepted the returned parcel." }, { status: 400 });
  const { id } = await params;
  const { error } = await createSupabaseAdminClient().rpc("complete_return_to_sender", { target_order_id: id, actor_id: auth.user.id, completion_evidence: { recipientName: parsed.data.recipientName, notes: parsed.data.notes ?? null, source: "rider_workspace" }, request_idempotency_key: parsed.data.idempotencyKey });
  if (error) return NextResponse.json({ error: error.message }, { status: 409 });
  return NextResponse.json({ status: "returned_to_sender" });
}
