import { cookies } from "next/headers";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AssistedQuoteReview } from "@/components/assisted/quote-review";
import { hashAssistedSecret } from "@/features/assisted-bookings/security";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const metadata = { title: "Secure delivery quote", robots: { index: false, follow: false, nocache: true }, referrer: "no-referrer" };

export default async function AssistedQuotePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const admin = createSupabaseAdminClient();
  const tokenHash = hashAssistedSecret(token);
  const { data: access } = await admin.from("assisted_quote_access_tokens").select("draft_id,verified_at,verification_session_hash,verification_session_expires_at,expires_at,revoked_at,consumed_at").eq("token_hash", tokenHash).maybeSingle();
  if (!access || access.revoked_at || access.consumed_at || new Date(access.expires_at) <= new Date()) notFound();
  const session = (await cookies()).get("dovid_assisted_verification")?.value;
  const verified = Boolean(session && access.verified_at && access.verification_session_hash === hashAssistedSecret(session) && access.verification_session_expires_at && new Date(access.verification_session_expires_at) > new Date());
  let details: Parameters<typeof AssistedQuoteReview>[0]["details"];
  if (verified) {
    const { data: draft } = await admin.from("assisted_booking_drafts").select("request_payload,quotes(amount_minor,currency,expires_at)").eq("id", access.draft_id).maybeSingle();
    const quote = Array.isArray(draft?.quotes) ? draft.quotes[0] : draft?.quotes;
    const payload = draft?.request_payload as Record<string, unknown> | undefined;
    if (quote && payload) details = { pickupAddress: String(payload.pickupAddress), deliveryAddress: String(payload.deliveryAddress), packageDescription: String(payload.packageDescription), packageCategory: String(payload.packageCategory), packageSize: String(payload.packageSize), amountMinor: quote.amount_minor, currency: quote.currency, expiresAt: quote.expires_at };
  }
  return <section className="container py-8 sm:py-12"><div className="mb-7 flex justify-center"><Link href="/" aria-label="Dovid Logistics home"><Image className="h-auto w-[180px]" src="/brand/dovid-primary.svg" alt="Dovid Logistics" width={195} height={60} priority /></Link></div><AssistedQuoteReview token={token} verified={verified} details={details} /></section>;
}

