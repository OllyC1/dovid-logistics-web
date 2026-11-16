import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/20261115220000_resend_transactional_email.sql", "utf8");
const queue = readFileSync("src/lib/notifications/queue.ts", "utf8");
const webhook = readFileSync("src/app/api/webhooks/resend/route.ts", "utf8");

describe("Resend email migration", () => {
  it("claims queue work atomically with an expiring lease", () => {
    expect(sql).toContain("for update skip locked");
    expect(sql).toContain("lease_expires_at");
    expect(sql).toContain("attempt_count < 8");
  });

  it("deduplicates sends and provider events", () => {
    expect(sql).toContain("deduplication_key");
    expect(sql).toContain("unique(provider,provider_event_id)");
    expect(sql).toContain("notifications_provider_message_idx");
  });

  it("keeps delivery audit records immutable and client-inaccessible", () => {
    expect(sql).toContain("email delivery audit history is immutable");
    expect(sql).toContain("revoke all on public.notification_delivery_attempts,public.email_provider_events from public,anon,authenticated");
  });

  it("queues booking, pickup, delivery, payment, fee, failure and redelivery events", () => {
    for (const event of ["booking_confirmed", "package_collected", "package_delivered", "payment_confirmed", "additional_fee_request", "delivery_failed", "redelivery_scheduled"]) expect(sql).toContain(event);
  });

  it("schedules transient failures and records permanent failures", () => {
    expect(queue).toContain('delivery_status: retryable ? "deferred" : "failed"');
    expect(queue).toContain('outcome: retryable ? "retry_scheduled"');
    expect(queue).toContain('"permanent_failure"');
    expect(queue).toContain("next_attempt_at: retryAt");
  });

  it("deduplicates signed provider events before updating delivery state", () => {
    expect(webhook).toContain('error?.code === "23505"');
    expect(webhook).toContain("duplicate: true");
    expect(webhook).toContain('.eq("provider_message_id", emailId)');
  });

  it("does not let late non-terminal events downgrade delivery", () => {
    expect(webhook).toContain('"email.sent": { delivery_status: "accepted", allowedCurrent: ["queued", "accepted", "deferred"] }');
    expect(webhook).toContain('.in("delivery_status", mapped.allowedCurrent)');
  });
});
