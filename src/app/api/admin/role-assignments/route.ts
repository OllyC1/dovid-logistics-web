import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getAuthenticatedRole } from "@/lib/auth/roles";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const schema = z.object({ userId: z.uuid(), role: z.enum(["admin", "rider"]), verificationMethod: z.string().trim().min(4).max(100), verificationReference: z.string().trim().min(4).max(200), reason: z.string().trim().min(8).max(1_000), idempotencyKey: z.uuid() });

export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedRole();
  if (auth?.role !== "admin") return NextResponse.json({ error: "Admin authorization required" }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Verified identity evidence and an assignment reason are required." }, { status: 400 });
  const admin = createSupabaseAdminClient();
  const { data: authUser, error: authError } = await admin.auth.admin.getUserById(parsed.data.userId);
  if (authError || !authUser.user?.email_confirmed_at || authUser.user.banned_until) return NextResponse.json({ error: "The target account must have a verified, active identity." }, { status: 409 });
  const { data, error } = await admin.rpc("assign_verified_application_role", { target_user_id: parsed.data.userId, target_role: parsed.data.role, actor_id: auth.user.id, verification_method: parsed.data.verificationMethod, verification_reference: parsed.data.verificationReference, assignment_reason: parsed.data.reason, request_idempotency_key: parsed.data.idempotencyKey });
  if (error) return NextResponse.json({ error: error.message }, { status: 409 });
  return NextResponse.json({ assignmentId: data }, { status: 201 });
}
