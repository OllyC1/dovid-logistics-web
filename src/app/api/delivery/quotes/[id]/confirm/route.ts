import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { publicBookingsEnabled } from "@/lib/launch-controls";

const schema = z.object({ idempotencyKey: z.uuid() });
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!publicBookingsEnabled()) return NextResponse.json({ error: "Online bookings are not open yet. Please contact Dovid Logistics for help." }, { status: 503 });
  const { id } = await params;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "A valid idempotency key is required" }, { status: 400 });
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in to confirm this quote" }, { status: 401 });
  const admin = createSupabaseAdminClient();
  const { data: existing } = await admin.from("quotes").select("id,status,amount_minor,currency,expires_at").eq("customer_id", user.id).eq("confirmation_idempotency_key", parsed.data.idempotencyKey).maybeSingle();
  if (existing) return NextResponse.json({ quoteId: existing.id, status: existing.status, customerTotalKobo: existing.amount_minor, currency: existing.currency });
  const { data: quote } = await admin.from("quotes").select("id,status,amount_minor,currency,expires_at,customer_id,operational_approval_status").eq("id", id).maybeSingle();
  if (!quote) return NextResponse.json({ error: "Quote not found" }, { status: 404 });
  if (new Date(quote.expires_at) <= new Date()) { await admin.from("quotes").update({ status: "expired" }).eq("id", id); return NextResponse.json({ error: "Quote has expired" }, { status: 410 }); }
  if (quote.status !== "created" && quote.status !== "confirmed") return NextResponse.json({ error: "Quote cannot be confirmed" }, { status: 409 });
  if (quote.operational_approval_status !== "not_required" && quote.operational_approval_status !== "approved") return NextResponse.json({ error: "This route still needs confirmation from our dispatch team." }, { status: 409 });
  if (quote.customer_id && quote.customer_id !== user.id) return NextResponse.json({ error: "Quote belongs to another account" }, { status: 403 });
  const { data: confirmed, error } = await admin.from("quotes").update({ customer_id: user.id, status: "confirmed", confirmed_at: new Date().toISOString(), confirmation_idempotency_key: parsed.data.idempotencyKey }).eq("id", id).or(`customer_id.is.null,customer_id.eq.${user.id}`).select("id,status,amount_minor,currency,expires_at").maybeSingle();
  if (error) return NextResponse.json({ error: "Quote confirmation failed" }, { status: 409 });
  if (!confirmed) {
    const { data: owned } = await admin.from("quotes").select("id,status,amount_minor,currency,expires_at").eq("id", id).eq("customer_id", user.id).maybeSingle();
    if (!owned) return NextResponse.json({ error: "Quote belongs to another account" }, { status: 403 });
    return NextResponse.json({ quoteId: owned.id, status: owned.status, customerTotalKobo: owned.amount_minor, currency: owned.currency });
  }
  return NextResponse.json({ quoteId: confirmed.id, status: confirmed.status, customerTotalKobo: confirmed.amount_minor, currency: confirmed.currency });
}
