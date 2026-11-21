import { randomBytes, createHash } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getAuthenticatedRole } from "@/lib/auth/roles";
import { publicEnv } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const schema = z.object({ idempotencyKey: z.uuid().optional() });

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthenticatedRole();
  if (!auth || !["rider", "admin"].includes(auth.role)) return NextResponse.json({ error: "Rider authorization required" }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payment-link request" }, { status: 400 });
  const { id } = await params;
  const token = randomBytes(32).toString("base64url");
  const admin = createSupabaseAdminClient();
  const { error } = await admin.rpc("issue_rider_receiver_payment_token", {
    target_order_id: id,
    actor_id: auth.user.id,
    new_receiver_token_hash: createHash("sha256").update(token).digest("hex"),
    new_expires_at: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 409 });
  return NextResponse.json({ paymentUrl: `${publicEnv.NEXT_PUBLIC_APP_URL}/pay/receiver/${token}` }, { headers: { "Cache-Control": "no-store" } });
}
