import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const notificationEq = vi.fn();
  const notificationQuery = { eq: notificationEq };
  notificationEq.mockReturnValue(notificationQuery);

  return {
    rpc: vi.fn(),
    notificationUpdate: vi.fn(() => notificationQuery),
    deliveryAttemptInsert: vi.fn(),
    providerSend: vi.fn()
  };
});

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    rpc: mocks.rpc,
    from: (table: string) => table === "notifications"
      ? { update: mocks.notificationUpdate }
      : { insert: mocks.deliveryAttemptInsert }
  })
}));

vi.mock("@/lib/notifications/provider", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/notifications/provider")>();
  return {
    ...actual,
    getEmailProvider: () => ({ name: "resend", send: mocks.providerSend })
  };
});

import { processEmailQueue } from "@/lib/notifications/queue";

describe("email queue template safety", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rpc.mockResolvedValue({
      data: [{
        id: "notification-1",
        recipient_email: "recipient@example.com",
        subject: "Unreviewed event",
        event_type: "unreviewed_event",
        body: "This must not be sent.",
        metadata: {},
        deduplication_key: "email:unreviewed:1",
        attempt_count: 1
      }],
      error: null
    });
    mocks.deliveryAttemptInsert.mockResolvedValue({ error: null });
  });

  it("records an unknown event as a permanent template failure without contacting Resend", async () => {
    await expect(processEmailQueue(1)).resolves.toEqual({ claimed: 1, accepted: 0, retried: 0, failed: 1 });

    expect(mocks.providerSend).not.toHaveBeenCalled();
    expect(mocks.notificationUpdate).toHaveBeenCalledWith(expect.objectContaining({
      status: "failed",
      delivery_status: "failed",
      last_error_code: "unsupported_email_event",
      next_attempt_at: null
    }));
    expect(mocks.deliveryAttemptInsert).toHaveBeenCalledWith(expect.objectContaining({
      notification_id: "notification-1",
      outcome: "permanent_failure",
      error_code: "unsupported_email_event",
      retry_at: null
    }));
  });
});
