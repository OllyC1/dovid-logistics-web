import { randomUUID } from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getEmailProvider, NotificationProviderError } from "@/lib/notifications/provider";
import { renderTransactionalEmail, UnsupportedTransactionalEmailEventError } from "@/lib/notifications/templates";

type QueuedNotification = {
  id: string;
  recipient_email: string;
  subject: string;
  event_type: string;
  body: string;
  metadata: Record<string, unknown> | null;
  deduplication_key: string;
  attempt_count: number;
};

function retryDelaySeconds(attempt: number, requested?: number) {
  return Math.min(6 * 60 * 60, Math.max(requested ?? 0, 60 * 2 ** Math.min(attempt, 7)));
}

export async function processEmailQueue(batchLimit = 10) {
  const admin = createSupabaseAdminClient();
  const workerToken = randomUUID();
  const provider = getEmailProvider();
  const { data, error } = await admin.rpc("claim_email_notifications", { worker_token: workerToken, batch_limit: batchLimit });
  if (error) throw new Error(`Email queue claim failed: ${error.message}`);
  const results = { claimed: 0, accepted: 0, retried: 0, failed: 0 };
  for (const notification of (data ?? []) as QueuedNotification[]) {
    results.claimed += 1;
    try {
      const rendered = renderTransactionalEmail({ eventType: notification.event_type, body: notification.body, metadata: notification.metadata });
      const sent = await provider.send({ to: notification.recipient_email, subject: rendered.subject, html: rendered.html, text: rendered.text, deduplicationKey: notification.deduplication_key, replyTo: process.env.RESEND_REPLY_TO_EMAIL || undefined });
      const now = new Date().toISOString();
      const { error: updateError } = await admin.from("notifications").update({ status: "sent", delivery_status: "accepted", provider: provider.name, provider_message_id: sent.providerId, accepted_at: now, next_attempt_at: null, claim_token: null, claimed_at: null, lease_expires_at: null, last_error_code: null, last_error_message: null }).eq("id", notification.id).eq("claim_token", workerToken).eq("status", "sending");
      if (updateError) throw updateError;
      await admin.from("notification_delivery_attempts").insert({ notification_id: notification.id, attempt_number: notification.attempt_count, provider: provider.name, outcome: "accepted", provider_message_id: sent.providerId });
      results.accepted += 1;
    } catch (error) {
      const providerError = error instanceof NotificationProviderError
        ? error
        : error instanceof UnsupportedTransactionalEmailEventError
          ? new NotificationProviderError(error.message, "unsupported_email_event", false)
          : new NotificationProviderError(error instanceof Error ? error.message : "Unknown email failure", "unexpected_error", true);
      const retryable = providerError.retryable && notification.attempt_count < 8;
      const retryAt = retryable ? new Date(Date.now() + retryDelaySeconds(notification.attempt_count, providerError.retryAfterSeconds) * 1000).toISOString() : null;
      await admin.from("notifications").update({ status: "failed", delivery_status: retryable ? "deferred" : "failed", provider: provider.name, next_attempt_at: retryAt, failed_at: retryable ? null : new Date().toISOString(), claim_token: null, claimed_at: null, lease_expires_at: null, last_error_code: providerError.code.slice(0, 120), last_error_message: providerError.message.slice(0, 500) }).eq("id", notification.id).eq("claim_token", workerToken);
      await admin.from("notification_delivery_attempts").insert({ notification_id: notification.id, attempt_number: notification.attempt_count, provider: provider.name, outcome: retryable ? "retry_scheduled" : providerError.code === "provider_not_configured" ? "configuration_error" : "permanent_failure", error_code: providerError.code.slice(0, 120), error_message: providerError.message.slice(0, 500), retry_at: retryAt });
      if (retryable) results.retried += 1; else results.failed += 1;
    }
  }
  return results;
}
