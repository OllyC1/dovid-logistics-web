import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const { data: quote } = await supabase.from("quotes").select("id,status,amount_minor,currency,distance_meters,duration_seconds,service_level,customer_breakdown,expires_at,created_at").eq("id", id).eq("customer_id", user.id).maybeSingle();
  if (!quote) return NextResponse.json({ error: "Quote not found" }, { status: 404 });
  return NextResponse.json({ quoteId: quote.id, status: new Date(quote.expires_at) <= new Date() && quote.status === "created" ? "expired" : quote.status, customerTotalKobo: quote.amount_minor, currency: quote.currency, distanceMeters: quote.distance_meters, durationSeconds: quote.duration_seconds, serviceLevel: quote.service_level, includedCharges: quote.customer_breakdown, expiresAt: quote.expires_at, createdAt: quote.created_at });
}
