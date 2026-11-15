import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getPaymentsReconcilerAuthorization as getAuthenticatedRole } from "@/lib/auth/staff";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const schema = z.object({ status: z.enum(["approved","rejected","disputed"]), reason: z.string().trim().min(8).max(1_000), customerBillable: z.boolean().default(false), proposedAmountKobo: z.number().int().positive().optional(), surchargeIdempotencyKey: z.uuid().optional() }).superRefine((value, context) => { if (value.customerBillable && (!value.proposedAmountKobo || !value.surchargeIdempotencyKey)) context.addIssue({ code: "custom", message: "Customer-billable charges require an amount and idempotency key." }); });

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthenticatedRole();
  if (auth?.role !== "admin") return NextResponse.json({ error: "Admin authorization required" }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Complete the expense review.", issues: parsed.error.flatten() }, { status: 400 });
  const { id } = await params;
  const admin = createSupabaseAdminClient();
  const { data: expense } = await admin.from("delivery_expense_reports").select("id,order_id,category,description,amount_kobo,rider_id,status").eq("id", id).maybeSingle();
  if (!expense) return NextResponse.json({ error: "Expense report not found" }, { status: 404 });
  if (!["reported","under_review","disputed"].includes(expense.status)) return NextResponse.json({ error: "Expense review is already complete" }, { status: 409 });
  const { error } = await admin.from("delivery_expense_reports").update({ status: parsed.data.status, reviewed_by: auth.user.id, reviewed_at: new Date().toISOString(), review_reason: parsed.data.reason }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 409 });
  let surchargeId: string | null = null;
  if (parsed.data.status === "approved" && parsed.data.customerBillable) {
    const { data: surcharge, error: surchargeError } = await admin.from("customer_surcharges").insert({ order_id: expense.order_id, expense_report_id: expense.id, category: expense.category, description: expense.description, proposed_amount_kobo: parsed.data.proposedAmountKobo, status: "proposed", proposed_by: auth.user.id, admin_approved_by: auth.user.id, admin_approved_at: new Date().toISOString(), idempotency_key: parsed.data.surchargeIdempotencyKey }).select("id").single();
    if (surchargeError) return NextResponse.json({ error: "Expense was approved, but the separate customer proposal could not be created." }, { status: 500 });
    surchargeId = surcharge.id;
  }
  return NextResponse.json({ expenseStatus: parsed.data.status, surchargeId, customerCharged: false });
}

