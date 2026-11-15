import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { applyVerifiedPaystackTransaction } from "@/features/payments/verification";
import { verifyPaystackTransaction } from "@/lib/paystack/client";
import { takeRateLimit } from "@/lib/server/rate-limit";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const schema = z.string().regex(/^[A-Za-z0-9._-]{6,120}$/);

export async function GET(request: NextRequest) {
  const rateLimit = takeRateLimit(request, "payment-verification", 20);
  if (rateLimit.limited) return NextResponse.json({ error: "Too many verification attempts. Please wait a moment." }, { status: 429 });
  const parsed = schema.safeParse(request.nextUrl.searchParams.get("reference"));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payment reference" }, { status: 400 });
  const admin = createSupabaseAdminClient();
  const { data: intent } = await admin.from("payment_intents").select("id,order_id,surcharge_id,provider_reference,amount_minor,currency,status").eq("provider_reference", parsed.data).maybeSingle();
  if (!intent) return NextResponse.json({ error: "Payment request not found" }, { status: 404 });
  try {
    const transaction = await verifyPaystackTransaction(parsed.data);
    const status = await applyVerifiedPaystackTransaction(admin, intent, transaction, "callback");
    return NextResponse.json({ status, verified: status === "paid" });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Payment verification is unavailable" }, { status: 503 });
  }
}
