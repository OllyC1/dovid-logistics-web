import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getAuthenticatedRole } from "@/lib/auth/roles";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const schema = z.object({ orderId: z.uuid(), runId: z.uuid().nullable().optional(), category: z.enum(["toll_road_access","authorized_parking_access","waiting_time","extra_stop","address_correction","return_journey","redelivery","other"]), amountKobo: z.number().int().positive(), description: z.string().trim().min(5).max(1_000), location: z.object({ latitude: z.number(), longitude: z.number() }).optional(), occurredAt: z.iso.datetime(), receiptStoragePath: z.string().max(500).optional(), alreadyIncurred: z.boolean(), customerApprovalObtained: z.boolean(), idempotencyKey: z.uuid() });

export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedRole();
  if (!auth || !["rider","admin"].includes(auth.role)) return NextResponse.json({ error: "Rider authorization required" }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Complete the expense report.", issues: parsed.error.flatten() }, { status: 400 });
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("report_delivery_expense", { target_order_id: parsed.data.orderId, target_run_id: parsed.data.runId ?? null, actor_id: auth.user.id, expense_category: parsed.data.category, expense_amount_kobo: parsed.data.amountKobo, expense_description: parsed.data.description, expense_location: parsed.data.location ?? null, expense_occurred_at: parsed.data.occurredAt, receipt_path: parsed.data.receiptStoragePath ?? null, cost_already_incurred: parsed.data.alreadyIncurred, customer_approval: parsed.data.customerApprovalObtained, request_idempotency_key: parsed.data.idempotencyKey });
  if (error) return NextResponse.json({ error: error.message }, { status: 409 });
  return NextResponse.json({ expenseReportId: data, customerCharged: false }, { status: 201 });
}

