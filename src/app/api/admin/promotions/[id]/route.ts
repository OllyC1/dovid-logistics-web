import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getSuperAdminAuthorization } from "@/lib/auth/staff";

const schema = z.object({ active: z.boolean(), reason: z.string().trim().min(8).max(500) });

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getSuperAdminAuthorization();
  if (!auth) return NextResponse.json({ error: "Only the Super Admin can change promotions." }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Provide a clear reason for this change." }, { status: 400 });
  const id = (await params).id;
  const { data: rows, error } = await auth.admin.rpc("set_promotion_active", { target_promotion_id: id, action_actor_id: auth.user.id, next_active: parsed.data.active, change_reason: parsed.data.reason });
  const data = Array.isArray(rows) ? rows[0] : rows;
  if (error || !data) return NextResponse.json({ error: "The promotion could not be updated." }, { status: 409 });
  return NextResponse.json(data);
}
