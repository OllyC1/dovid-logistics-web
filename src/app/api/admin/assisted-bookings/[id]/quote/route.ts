import { NextResponse, type NextRequest } from "next/server";
import { assistedBookingDraftSchema } from "@/features/assisted-bookings/schema";
import { createAssistedQuote } from "@/features/assisted-bookings/create-quote";
import { createAssistedAccessSecrets } from "@/features/assisted-bookings/security";
import { getBookingsManagerAuthorization as getAuthenticatedRole } from "@/lib/auth/staff";
import { publicEnv } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { manualWhatsAppProvider } from "@/lib/whatsapp/provider";

export async function POST(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthenticatedRole();
  if (auth?.role !== "admin") return NextResponse.json({ error: "Admin authorization required" }, { status: 403 });
  const { id } = await params;
  const admin = createSupabaseAdminClient();
  const { data: draft } = await admin.from("assisted_booking_drafts").select("id,status,customer_phone,request_payload,quote_id").eq("id", id).maybeSingle();
  if (!draft) return NextResponse.json({ error: "Assisted booking draft not found" }, { status: 404 });
  if (draft.quote_id) return NextResponse.json({ error: "This draft already has a quote. Revoke it before generating another." }, { status: 409 });
  const parsed = assistedBookingDraftSchema.safeParse(draft.request_payload);
  if (!parsed.success) return NextResponse.json({ error: "The draft details are incomplete.", issues: parsed.error.flatten() }, { status: 400 });
  try {
    const result = await createAssistedQuote(draft.id, parsed.data);
    if (!result.quote) return NextResponse.json({ message: result.message, eligibility: result.decision, confirmedBookingCreated: false }, { status: result.decision === "unsupported" ? 422 : 202 });
    const secrets = createAssistedAccessSecrets();
    const accessExpiresAt = new Date(Math.min(new Date(result.quote.expiresAt).getTime(), Date.now() + 2 * 60 * 60 * 1000));
    const { error: tokenError } = await admin.from("assisted_quote_access_tokens").insert({ draft_id: draft.id, token_hash: secrets.tokenHash, otp_hash: secrets.otpHash, otp_expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(), expires_at: accessExpiresAt.toISOString() });
    if (tokenError) throw tokenError;
    const reviewUrl = `${publicEnv.NEXT_PUBLIC_APP_URL}/assisted/quote/${secrets.token}`;
    const message = `Dovid Logistics quote: review ${reviewUrl}. Your verification code is ${secrets.otp}. We will never ask you to pay cash or transfer to a rider.`;
    const whatsapp = await manualWhatsAppProvider.createReviewLink({ phone: draft.customer_phone, message });
    await admin.from("assisted_booking_events").insert({ draft_id: draft.id, event_type: "review_link_created", actor_id: auth.user.id, actor_type: "admin", metadata: { expiresAt: accessExpiresAt.toISOString(), providerMode: "manual" } });
    return NextResponse.json({ quote: result.quote, reviewUrl, verificationCode: secrets.otp, whatsappUrl: whatsapp.url, automatedMessageSent: whatsapp.automated });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Assisted quote could not be created" }, { status: 409 });
  }
}

