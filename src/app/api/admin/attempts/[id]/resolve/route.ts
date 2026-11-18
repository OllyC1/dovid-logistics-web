import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getDispatchManagerAuthorization as getAuthenticatedRole } from "@/lib/auth/staff";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const attemptResolutionSchema = z.object({
  resolution: z.enum(["retry_immediately","schedule_redelivery","correct_address","return_to_sender","authorized_hold","open_incident","cancel"]),
  attributableTo: z.enum(["customer","dovid","under_review"]),
  reason: z.string().trim().min(8).max(1_000),
  scheduledAt: z.iso.datetime().optional(),
  correctedAddress: z.string().trim().min(8).max(300).optional(),
  correctedLatitude: z.number().min(-90).max(90).optional(),
  correctedLongitude: z.number().min(-180).max(180).optional(),
  idempotencyKey: z.uuid(),
}).superRefine((value, context) => {
  if (value.resolution === "schedule_redelivery") {
    if (!value.scheduledAt) context.addIssue({ code: "custom", path: ["scheduledAt"], message: "Choose the agreed redelivery date and time." });
    else if (new Date(value.scheduledAt).getTime() <= Date.now()) context.addIssue({ code: "custom", path: ["scheduledAt"], message: "Redelivery must be scheduled in the future." });
  }
  if (value.resolution === "correct_address" && (!value.correctedAddress || value.correctedLatitude === undefined || value.correctedLongitude === undefined)) {
    context.addIssue({ code: "custom", path: ["correctedAddress"], message: "Choose the corrected address from the verified suggestions." });
  }
});

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthenticatedRole();
  if (auth?.role !== "admin") return NextResponse.json({ error: "Admin authorization required" }, { status: 403 });
  const parsed = attemptResolutionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Complete the exception resolution.", issues: parsed.error.flatten() }, { status: 400 });
  const { id } = await params;
  const { data, error } = await createSupabaseAdminClient().rpc("resolve_delivery_attempt", { target_attempt_id: id, actor_id: auth.user.id, resolution: parsed.data.resolution, attributable_to: parsed.data.attributableTo, resolution_reason: parsed.data.reason, requested_schedule: parsed.data.scheduledAt ?? null, corrected_address: parsed.data.correctedAddress ?? null, corrected_latitude: parsed.data.correctedLatitude ?? null, corrected_longitude: parsed.data.correctedLongitude ?? null, request_idempotency_key: parsed.data.idempotencyKey });
  if (error) return NextResponse.json({ error: error.message }, { status: 409 });
  return NextResponse.json({ ...(data as Record<string, unknown>), customerChargeCreated: false, customerApprovalRequired: parsed.data.attributableTo === "customer" && ["schedule_redelivery", "return_to_sender"].includes(parsed.data.resolution) });
}

