import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { hashAssistedSecret } from "@/features/assisted-bookings/security";
import { getDispatchManagerAuthorization as getAuthenticatedRole } from "@/lib/auth/staff";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const schema = z.object({ status: z.enum(["approved", "rejected"]), reason: z.string().trim().min(8).max(1_000) });
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthenticatedRole();
  if (auth?.role !== "admin") return NextResponse.json({ error: "Admin authorization required" }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "A decision and reason are required." }, { status: 400 });
  const { id } = await params;
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.from("delivery_availability_requests").update({ status: parsed.data.status, review_reason: parsed.data.reason, reviewed_by: auth.user.id, reviewed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", id).eq("status", "pending").select("id,reference_code,status,request_payload").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 409 });
  await admin.from("audit_logs").insert({ actor_id: auth.user.id, actor_type: "admin", action: `availability_request.${parsed.data.status}`, resource_type: "delivery_availability_request", resource_id: id, metadata: { reason: parsed.data.reason } });
  const payload = (data.request_payload ?? {}) as Record<string, unknown>;
  const email = z.email().safeParse(payload.notificationEmail);
  let notificationQueued = false;
  if (email.success) {
    const token = parsed.data.status === "approved" ? randomBytes(32).toString("base64url") : null;
    if (token) {
      const { error: tokenError } = await admin.from("availability_request_access_tokens").insert({ availability_request_id: data.id, token_hash: hashAssistedSecret(token), expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() });
      if (!tokenError) {
        const { error: notificationError } = await admin.from("notifications").insert({ customer_id: null, order_id: null, channel: "email", event_type: "dispatch_request_approved", title: "Your Dovid route is approved", subject: "Continue your Dovid Logistics booking", body: `Dispatch approved delivery request ${data.reference_code}. Your order has not been created and no rider has been assigned yet. Review the saved details, see the confirmed price and choose payment to finish the booking.`, recipient_email: email.data.toLowerCase(), deduplication_key: `email:availability-approved:${data.id}`, status: "queued", delivery_status: "queued", priority: 85, metadata: { actionPath: `/book?approvalToken=${token}`, availabilityRequestId: data.id, reference: data.reference_code }, next_attempt_at: new Date().toISOString() });
        notificationQueued = !notificationError;
      }
    } else {
      const { error: notificationError } = await admin.from("notifications").insert({ customer_id: null, order_id: null, channel: "email", event_type: "dispatch_request_rejected", title: "Update on your Dovid delivery request", subject: "Update on your Dovid Logistics route request", body: `Dispatch could not approve delivery request ${data.reference_code}. Reason: ${parsed.data.reason}. No order was created and no payment was taken.`, recipient_email: email.data.toLowerCase(), deduplication_key: `email:availability-rejected:${data.id}`, status: "queued", delivery_status: "queued", priority: 80, metadata: { actionPath: "/book", availabilityRequestId: data.id, reference: data.reference_code }, next_attempt_at: new Date().toISOString() });
      notificationQueued = !notificationError;
    }
  }
  return NextResponse.json({ status: parsed.data.status, reference: data.reference_code, notificationQueued, continuationReady: parsed.data.status === "approved" });
}
