import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getAuthenticatedRole } from "@/lib/auth/roles";
import { getDispatchManagerAuthorization } from "@/lib/auth/staff";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const schema = z.object({
  recipientName: z.string().trim().min(2).max(120),
  notes: z.string().trim().max(1_000).optional(),
  identityConfirmed: z.literal(true),
});

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthenticatedRole();
  if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!["rider", "admin"].includes(auth.role)) return NextResponse.json({ error: "Rider authorization required" }, { status: 403 });
  if (auth.role === "admin" && !await getDispatchManagerAuthorization()) return NextResponse.json({ error: "Dispatch permission required" }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Confirm the recipient name and identity check." }, { status: 400 });

  const { id } = await params;
  const admin = createSupabaseAdminClient();
  const { data: order } = await admin.from("delivery_orders")
    .select("id,rider_id,delivery_status")
    .eq("id", id)
    .maybeSingle();
  if (!order) return NextResponse.json({ error: "Assigned order not found" }, { status: 404 });
  if (auth.role === "rider" && order.rider_id !== auth.user.id) return NextResponse.json({ error: "Order is not assigned to this rider" }, { status: 403 });

  const { data: proof, error } = await admin.rpc("record_delivery_proof", {
    target_order_id: id,
    actor_id: auth.user.id,
    confirmed_recipient_name: parsed.data.recipientName,
    proof_notes: parsed.data.notes || null,
  });
  if (error) {
    const message = error.message.toLowerCase();
    if (message.includes("payment")) return NextResponse.json({ error: "Verified payment is still outstanding. Do not release the parcel." }, { status: 409 });
    if (message.includes("authorization")) return NextResponse.json({ error: "Assigned rider or dispatch authorization required." }, { status: 403 });
    if (message.includes("record arrival")) return NextResponse.json({ error: "Record arrival before confirming the recipient." }, { status: 409 });
    return NextResponse.json({ error: "Recipient confirmation could not be recorded." }, { status: 409 });
  }
  const recorded = proof as { already_recorded?: boolean };
  return NextResponse.json({ proof, alreadyRecorded: Boolean(recorded.already_recorded) }, { status: recorded.already_recorded ? 200 : 201 });
}
