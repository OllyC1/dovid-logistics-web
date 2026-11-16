import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/20261115220000_resend_transactional_email.sql", "utf8");

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
});
