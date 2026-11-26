import { publicEnv } from "@/lib/env";
import { siteConfig } from "@/config/site";

export type EmailTemplateInput = { eventType: string; heading: string; body: string; metadata?: Record<string, unknown> | null };

type EmailPurpose = {
  badge: string;
  actionLabel?: string;
  safetyNote: string;
};

const customerSafetyNote = "For your safety, use only links that open the Dovid Logistics website. We will never ask you to send money to a rider's personal account.";
const staffSafetyNote = "This is a staff-only operational message. Sign in with your verified Dovid Logistics staff account before taking action.";

export const transactionalEmailPurposes = {
  booking_confirmed: { badge: "Booking confirmed", actionLabel: "View booking", safetyNote: customerSafetyNote },
  package_collected: { badge: "Pickup update", actionLabel: "Track delivery", safetyNote: customerSafetyNote },
  package_delivered: { badge: "Delivery completed", actionLabel: "View delivery receipt", safetyNote: customerSafetyNote },
  delivery_failed: { badge: "Delivery needs attention", actionLabel: "Review next steps", safetyNote: customerSafetyNote },
  payment_confirmed: { badge: "Payment receipt", actionLabel: "View payment details", safetyNote: customerSafetyNote },
  additional_fee_request: { badge: "Additional charge", actionLabel: "Review and pay charge", safetyNote: customerSafetyNote },
  redelivery_scheduled: { badge: "Redelivery scheduled", actionLabel: "View redelivery details", safetyNote: customerSafetyNote },
  "dispatch.approval_requested": { badge: "Dispatch approval needed", actionLabel: "Open Dispatch Control", safetyNote: staffSafetyNote },
  "dispatch.approval_queue": { badge: "Dispatch queue", actionLabel: "Review pending routes", safetyNote: staffSafetyNote },
  dispatch_request_approved: {
    badge: "Route approved",
    actionLabel: "Continue booking",
    safetyNote: "Your delivery is not confirmed until you finish the booking. Dovid Logistics will not charge you before you choose an approved payment option."
  },
  dispatch_request_rejected: {
    badge: "Route decision",
    actionLabel: "Plan another route",
    safetyNote: "No order was created and no payment was taken for this request."
  },
  website_enquiry_received: {
    badge: "New customer enquiry",
    actionLabel: "Open admin workspace",
    safetyNote: "Customer contact details are confidential. Reply only through approved Dovid Logistics channels."
  },
  website_enquiry_acknowledged: {
    badge: "Enquiry received",
    safetyNote: "Our team will reply using the contact details you provided. You do not need to sign in or make a payment for an enquiry."
  },
  production_readiness_test: {
    badge: "Email system check",
    safetyNote: "This controlled message checks Dovid Logistics email delivery. No customer action or payment is required."
  }
} satisfies Record<string, EmailPurpose>;

function fallbackPurpose(): EmailPurpose {
  return { badge: "Dovid Logistics update", safetyNote: "If you did not expect this message, contact Dovid Logistics using the details below." };
}

export function getTransactionalEmailPurpose(eventType: string, metadata?: Record<string, unknown> | null): EmailPurpose {
  const purpose = transactionalEmailPurposes[eventType as keyof typeof transactionalEmailPurposes] ?? fallbackPurpose();
  const enquiryKind = metadata?.enquiryKind === "business" ? "business" : metadata?.enquiryKind === "support" ? "support" : null;
  if (eventType === "website_enquiry_received" && enquiryKind) return { ...purpose, badge: `New ${enquiryKind} enquiry` };
  if (eventType === "website_enquiry_acknowledged" && enquiryKind) return { ...purpose, badge: `${humanize(enquiryKind)} enquiry received` };
  return purpose;
}

function escapeHtml(value: unknown) {
  return String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] ?? character);
}

function money(amountMinor: unknown, currency: unknown) {
  if (typeof amountMinor !== "number" || !Number.isFinite(amountMinor)) return null;
  return new Intl.NumberFormat("en-NG", { style: "currency", currency: String(currency || "NGN") }).format(amountMinor / 100);
}

function safeActionPath(value: unknown) {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || /[\r\n\t]/.test(value)) return null;
  return value;
}

function humanize(value: string) {
  const normalized = value.replaceAll("_", " ").trim();
  return normalized ? `${normalized[0].toUpperCase()}${normalized.slice(1)}` : normalized;
}

function renderBody(body: string) {
  const paragraphs = body.trim().split(/\n{2,}/).filter(Boolean);
  if (!paragraphs.length) return "";
  return paragraphs.map((paragraph) => `<p style="margin:0 0 14px;color:#475569;font-size:16px;line-height:1.7">${escapeHtml(paragraph).replaceAll("\n", "<br>")}</p>`).join("");
}

function removeLegacyActionSuffix(body: string, actionPath: string | null) {
  if (!actionPath) return body;
  const suffix = ` Track it here: ${actionPath}`;
  return body.endsWith(suffix) ? body.slice(0, -suffix.length) : body;
}

export function renderTransactionalEmail(input: EmailTemplateInput) {
  const metadata = input.metadata ?? {};
  const purpose = getTransactionalEmailPurpose(input.eventType, metadata);
  const actionPath = safeActionPath(metadata.actionPath);
  const actionUrl = purpose.actionLabel && actionPath ? new URL(actionPath, publicEnv.NEXT_PUBLIC_APP_URL).toString() : null;
  const body = removeLegacyActionSuffix(input.body, actionPath);
  const orderReference = typeof metadata.orderReference === "string" ? metadata.orderReference : null;
  const trackingReference = typeof metadata.trackingReference === "string" ? metadata.trackingReference : null;
  const requestReference = typeof metadata.referenceCode === "string" ? metadata.referenceCode : typeof metadata.reference === "string" ? metadata.reference : null;
  const amount = money(metadata.amountMinor, metadata.currency);
  const rows = [
    orderReference ? ["Order", orderReference] : null,
    trackingReference ? ["Tracking", trackingReference] : null,
    requestReference ? ["Request", requestReference] : null,
    amount ? ["Amount", amount] : null,
    typeof metadata.paymentStatus === "string" ? ["Payment", humanize(metadata.paymentStatus)] : null,
    typeof metadata.pendingCount === "number" ? ["Pending routes", String(metadata.pendingCount)] : null
  ].filter(Boolean) as string[][];
  const summary = rows.length ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;background:#F8FAFC;border-radius:16px;padding:8px 20px">${rows.map(([label, value]) => `<tr><td style="padding:10px 0;color:#64748B;font-size:13px">${escapeHtml(label)}</td><td style="padding:10px 0;color:#0B1F44;font-size:14px;font-weight:700;text-align:right">${escapeHtml(value)}</td></tr>`).join("")}</table>` : "";
  const action = actionUrl ? `<p style="margin:24px 0 0"><a href="${escapeHtml(actionUrl)}" style="display:inline-block;background:#FF6A00;color:#FFFFFF;text-decoration:none;border-radius:999px;padding:14px 22px;font-size:15px;font-weight:700">${escapeHtml(purpose.actionLabel)}</a></p>` : "";
  const html = `<!doctype html><html><body style="margin:0;background:#F8FAFC;font-family:Arial,sans-serif;color:#15243B"><div style="display:none;max-height:0;overflow:hidden">${escapeHtml(input.heading)}</div><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:24px 12px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:#FFFFFF;border-radius:24px;overflow:hidden"><tr><td style="background:#0B1F44;padding:24px 28px;color:#FFFFFF"><div style="font-size:21px;font-weight:800">Dovid <span style="color:#FF6A00">Logistics</span></div></td></tr><tr><td style="padding:32px 28px"><div style="display:inline-block;border-radius:999px;background:#FFF1E8;color:#C54E00;padding:7px 12px;font-size:12px;font-weight:700;text-transform:uppercase">${escapeHtml(purpose.badge)}</div><h1 style="margin:18px 0 12px;color:#0B1F44;font-size:28px;line-height:1.2">${escapeHtml(input.heading)}</h1>${renderBody(body)}${summary}${action}<p style="margin:24px 0 0;color:#64748B;font-size:13px;line-height:1.6">${escapeHtml(purpose.safetyNote)}</p></td></tr><tr><td style="border-top:1px solid #E2E8F0;padding:20px 28px;color:#64748B;font-size:12px;line-height:1.6">Dovid Logistics · Ibadan, Oyo State<br>Need help? ${escapeHtml(siteConfig.support.email)} · ${escapeHtml(siteConfig.support.phone)}</td></tr></table></td></tr></table></body></html>`;
  const textRows = rows.map(([label, value]) => `${label}: ${value}`).join("\n");
  const actionText = actionUrl ? `\n\n${purpose.actionLabel}: ${actionUrl}` : "";
  const text = `Dovid Logistics\n${purpose.badge}\n\n${input.heading}\n\n${body}${textRows ? `\n\n${textRows}` : ""}${actionText}\n\n${purpose.safetyNote}\nSupport: ${siteConfig.support.email} · ${siteConfig.support.phone}`;
  return { html, text };
}
