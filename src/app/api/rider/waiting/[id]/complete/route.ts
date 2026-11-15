import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { calculateWaitingCharge } from "@/features/operations/waiting";
import { getAuthenticatedRole } from "@/lib/auth/roles";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const schema = z.object({ excludedSeconds: z.number().int().nonnegative().default(0), exclusionReason: z.string().max(1_000).optional(), expenseIdempotencyKey: z.uuid() });

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthenticatedRole();
  if (!auth || auth.role !== "rider") return NextResponse.json({ error: "Rider authorization required" }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid waiting completion" }, { status: 400 });
  const { id } = await params;
  const admin = createSupabaseAdminClient();
  const { data: waiting } = await admin.from("delivery_waiting_sessions").select("id,order_id,run_id,rider_id,started_at,status,free_waiting_minutes_snapshot,fee_per_minute_kobo_snapshot").eq("id", id).maybeSingle();
  if (!waiting || waiting.rider_id !== auth.user.id || !["running","paused"].includes(waiting.status)) return NextResponse.json({ error: "Active waiting session not found" }, { status: 404 });
  const endedAt = new Date();
  const result = calculateWaitingCharge({ startedAt: new Date(waiting.started_at), endedAt, excludedSeconds: parsed.data.excludedSeconds, freeWaitingMinutes: waiting.free_waiting_minutes_snapshot, feePerMinuteKobo: waiting.fee_per_minute_kobo_snapshot });
  const { error } = await admin.from("delivery_waiting_sessions").update({ ended_at: endedAt.toISOString(), excluded_seconds: parsed.data.excludedSeconds, exclusion_reason: parsed.data.exclusionReason ?? null, calculated_charge_kobo: result.chargeKobo, status: "completed" }).eq("id", waiting.id).eq("status", waiting.status);
  if (error) return NextResponse.json({ error: error.message }, { status: 409 });
  let expenseReportId: string | null = null;
  if (result.chargeKobo && result.chargeKobo > 0) {
    const { data } = await admin.rpc("report_delivery_expense", { target_order_id: waiting.order_id, target_run_id: waiting.run_id, actor_id: auth.user.id, expense_category: "waiting_time", expense_amount_kobo: result.chargeKobo, expense_description: "Server-calculated waiting time for administrator review", expense_location: null, expense_occurred_at: endedAt.toISOString(), receipt_path: null, cost_already_incurred: false, customer_approval: false, request_idempotency_key: parsed.data.expenseIdempotencyKey });
    expenseReportId = data;
  }
  return NextResponse.json({ ...result, expenseReportId, customerCharged: false });
}

