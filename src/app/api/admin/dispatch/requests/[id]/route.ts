import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getDispatchManagerAuthorization as getAuthenticatedRole } from "@/lib/auth/staff";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const schema = z.object({ status: z.enum(["approved", "rejected"]), reason: z.string().trim().min(8).max(1_000) });
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthenticatedRole();
  if (auth?.role !== "admin") return NextResponse.json({ error: "Admin authorization required" }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "A decision and reason are required." }, { status: 400 });
  const { id } = await params;
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.from("delivery_availability_requests").update({ status: parsed.data.status, review_reason: parsed.data.reason, reviewed_by: auth.user.id, reviewed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", id).eq("status", "pending").select("id,reference_code,status").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 409 });
  await admin.from("audit_logs").insert({ actor_id: auth.user.id, actor_type: "admin", action: `availability_request.${parsed.data.status}`, resource_type: "delivery_availability_request", resource_id: id, metadata: { reason: parsed.data.reason } });
  return NextResponse.json({ status: parsed.data.status, reference: data.reference_code });
}
