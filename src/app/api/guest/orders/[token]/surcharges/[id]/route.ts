import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { hashAssistedSecret } from "@/features/assisted-bookings/security";
import { takeRateLimit } from "@/lib/server/rate-limit";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const schema = z.object({
  action: z.enum(["approve", "reject", "dispute"]),
  reason: z.string().trim().max(500).optional(),
  idempotencyKey: z.uuid(),
}).superRefine((value, context) => {
  if (value.action !== "approve" && (!value.reason || value.reason.length < 3)) {
    context.addIssue({ code: "custom", path: ["reason"], message: "Please give a short reason." });
  }
});

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ token: string; id: string }> }) {
  const rateLimit = takeRateLimit(request, "guest-surcharge-response", 12, 10 * 60_000);
  if (rateLimit.limited) return NextResponse.json({ error: "Too many attempts. Please wait a few minutes." }, { status: 429 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Choose a response and add a short reason when needed." }, { status: 400 });
  const { token, id } = await params;
  if (!z.uuid().safeParse(id).success || token.length < 40 || token.length > 128) {
    return NextResponse.json({ error: "Invalid charge response." }, { status: 400 });
  }
  const admin = createSupabaseAdminClient();
  const { data: status, error } = await admin.rpc("respond_to_guest_surcharge", {
    guest_access_token_hash: hashAssistedSecret(token),
    target_surcharge_id: id,
    response_action: parsed.data.action,
    response_reason: parsed.data.reason ?? "",
    response_idempotency: parsed.data.idempotencyKey,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 409 });
  return NextResponse.json({ status }, { headers: { "Cache-Control": "no-store" } });
}
