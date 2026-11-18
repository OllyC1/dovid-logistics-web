import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getPricingManagerAuthorization as getAuthenticatedRole } from "@/lib/auth/staff";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const schema = z.object({ reason: z.string().trim().min(8).max(500) });

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthenticatedRole();
  if (auth?.role !== "admin") return NextResponse.json({ error: "Admin authorization required" }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Record the approval reason before activation." }, { status: 400 });
  const { id } = await params;
  const { error } = await createSupabaseAdminClient().rpc("activate_rate_card", { target_rate_card_id: id, actor_id: auth.user.id, reason: parsed.data.reason });
  if (error) return NextResponse.json({ error: error.message || "Rate card could not be activated" }, { status: 400 });
  return NextResponse.json({ id, active: true });
}
