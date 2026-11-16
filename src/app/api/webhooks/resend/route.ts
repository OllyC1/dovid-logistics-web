import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { verifyResendWebhook } from "@/lib/resend/webhook";

export const runtime = "nodejs";

type ResendEvent = { type?: string; data?: { email_id?: string }; created_at?: string };
const statuses: Record<string, { delivery_status: string; final?: boolean }> = {
  "email.sent": { delivery_status: "accepted" },
  "email.delivered": { delivery_status: "delivered", final: true },
  "email.delivery_delayed": { delivery_status: "deferred" },
  "email.bounced": { delivery_status: "bounced", final: true },
  "email.complained": { delivery_status: "complained", final: true },
  "email.failed": { delivery_status: "failed", final: true }
};

export async function POST(request: NextRequest) {
  const payload = await request.text();
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret || !verifyResendWebhook({ payload, id: request.headers.get("svix-id"), timestamp: request.headers.get("svix-timestamp"), signature: request.headers.get("svix-signature"), secret })) return NextResponse.json({ error: "Invalid webhook signature" }, { status: 401 });
  let event: ResendEvent;
  try { event = JSON.parse(payload) as ResendEvent; } catch { return NextResponse.json({ error: "Invalid webhook payload" }, { status: 400 }); }
  const eventId = request.headers.get("svix-id")!;
  const emailId = event.data?.email_id ?? null;
  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("email_provider_events").insert({ provider: "resend", provider_event_id: eventId, provider_message_id: emailId, event_type: event.type ?? "unknown", payload: event });
  if (error?.code === "23505") return NextResponse.json({ received: true, duplicate: true });
  if (error) return NextResponse.json({ error: "Webhook event could not be recorded" }, { status: 503 });
  const mapped = event.type ? statuses[event.type] : undefined;
  if (emailId && mapped) {
    const changes: Record<string, unknown> = { delivery_status: mapped.delivery_status };
    if (event.type === "email.delivered") changes.delivered_at = event.created_at ?? new Date().toISOString();
    if (mapped.final && event.type !== "email.delivered") changes.failed_at = event.created_at ?? new Date().toISOString();
    await admin.from("notifications").update(changes).eq("provider", "resend").eq("provider_message_id", emailId);
  }
  return NextResponse.json({ received: true });
}
