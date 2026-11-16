export type NotificationMessage = { to: string; subject: string; html: string; text: string; deduplicationKey: string; replyTo?: string };

export class NotificationProviderError extends Error {
  constructor(message: string, public readonly code: string, public readonly retryable: boolean, public readonly retryAfterSeconds?: number) { super(message); }
}

export interface NotificationProvider { name: string; send(message: NotificationMessage): Promise<{ providerId: string }> }

export class DisabledNotificationProvider implements NotificationProvider {
  name = "disabled";
  async send(): Promise<{ providerId: string }> { throw new NotificationProviderError("Notification provider is not configured", "provider_not_configured", false); }
}

export class ResendNotificationProvider implements NotificationProvider {
  name = "resend";
  constructor(private readonly apiKey: string, private readonly from: string) {}
  async send(message: NotificationMessage) {
    const response = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json", "Idempotency-Key": message.deduplicationKey.slice(0, 256) }, body: JSON.stringify({ from: this.from, to: [message.to], subject: message.subject, html: message.html, text: message.text, reply_to: message.replyTo }) });
    const payload = await response.json().catch(() => ({})) as { id?: string; name?: string; message?: string };
    if (!response.ok || !payload.id) {
      const retryable = response.status === 408 || response.status === 429 || response.status >= 500;
      const retryAfter = Number(response.headers.get("retry-after"));
      throw new NotificationProviderError(payload.message || "Email provider rejected the request", payload.name || `resend_${response.status}`, retryable, Number.isFinite(retryAfter) ? retryAfter : undefined);
    }
    return { providerId: payload.id };
  }
}

export function getEmailProvider(): NotificationProvider {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL || process.env.EMAIL_FROM;
  return apiKey && from ? new ResendNotificationProvider(apiKey, from) : new DisabledNotificationProvider();
}
