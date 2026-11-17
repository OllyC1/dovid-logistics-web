import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getPricingManagerAuthorization } from "@/lib/auth/staff";

const schema = z.object({ reason: z.string().trim().min(8).max(500) });

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getPricingManagerAuthorization();
  if (!auth) return NextResponse.json({ error: "Pricing management permission is required." }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Provide a clear reason for deleting this draft." }, { status: 400 });
  const id = (await params).id;
  const { data: card } = await auth.admin.from("rate_cards").select("id,name,active").eq("id", id).maybeSingle();
  if (!card) return NextResponse.json({ error: "Rate card not found." }, { status: 404 });
  if (card.active) return NextResponse.json({ error: "An active rate card cannot be deleted. Create and activate a replacement first." }, { status: 409 });
  const { count } = await auth.admin.from("quotes").select("id", { count: "exact", head: true }).eq("rate_card_id", id);
  if ((count ?? 0) > 0) return NextResponse.json({ error: "This rate card has quote history and must remain immutable." }, { status: 409 });
  const deleted = await auth.admin.rpc("delete_unused_rate_card_draft", { target_rate_card_id: id, action_actor_id: auth.user.id, deletion_reason: parsed.data.reason });
  if (deleted.error) return NextResponse.json({ error: deleted.error.message }, { status: 409 });
  return NextResponse.json({ deleted: true });
}
