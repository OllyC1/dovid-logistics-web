import { publicEnv } from "@/lib/env";
import { siteConfig } from "@/config/site";

export type EmailTemplateInput = {
  eventType: string;
  body: string;
  metadata?: Record<string, unknown> | null;
  /** Kept for queue compatibility. Approved templates own the visible heading. */
  heading?: string;
};

type DetailKey =
  | "orderReference"
  | "trackingReference"
  | "requestReference"
  | "route"
  | "amount"
  | "paymentStatus"
  | "reason"
  | "scheduledAt"
  | "pendingCount"
  | "staffRole"
  | "expiresAt";

type EmailContext = { metadata: Record<string, unknown> };
type ContextText = string | ((context: EmailContext) => string);

type EmailPurpose = {
  badge: ContextText;
  subject: ContextText;
  heading: ContextText;
  actionLabel?: string;
  safetyNote: string;
  details: readonly DetailKey[];
};

export class UnsupportedTransactionalEmailEventError extends Error {
  constructor(public readonly eventType: string) {
    super(`No approved transactional email template exists for event: ${eventType}`);
    this.name = "UnsupportedTransactionalEmailEventError";
  }
}

const customerSafetyNote = "For your safety, use only links that open the Dovid Logistics website. We will never ask you to send money to a rider's personal account.";
const staffSafetyNote = "This is a staff-only operational message. Sign in with your verified Dovid Logistics staff account before taking action.";

function metadataText(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function humanize(value: string) {
  const normalized = value.replaceAll("_", " ").trim();
  return normalized ? `${normalized[0].toUpperCase()}${normalized.slice(1)}` : normalized;
}

function enquiryKind(metadata: Record<string, unknown>) {
  return metadata.enquiryKind === "business" ? "business" : "support";
}

function staffRole(metadata: Record<string, unknown>) {
  return metadata.staffRole === "rider" ? "rider" : "administrator";
}

export const transactionalEmailPurposes = {
  booking_confirmed: {
    badge: "Booking confirmed",
    subject: "Your Dovid Logistics booking is confirmed",
    heading: "Your delivery is confirmed",
    actionLabel: "View booking",
    safetyNote: customerSafetyNote,
    details: ["orderReference", "trackingReference", "route", "amount", "paymentStatus"]
  },
  package_collected: {
    badge: "Package collected",
    subject: "Your package has been collected",
    heading: "Your delivery is on the way",
    actionLabel: "Track delivery",
    safetyNote: customerSafetyNote,
    details: ["orderReference", "trackingReference", "route"]
  },
  package_delivered: {
    badge: "Delivery completed",
    subject: "Your Dovid Logistics delivery is complete",
    heading: "Your package has been delivered",
    actionLabel: "View delivery receipt",
    safetyNote: customerSafetyNote,
    details: ["orderReference", "trackingReference", "paymentStatus"]
  },
  delivery_failed: {
    badge: "Delivery needs attention",
    subject: "Action needed: we could not complete your delivery",
    heading: "We could not complete this delivery",
    actionLabel: "Review next steps",
    safetyNote: customerSafetyNote,
    details: ["orderReference", "trackingReference", "reason"]
  },
  payment_confirmed: {
    badge: "Payment receipt",
    subject: "Your Dovid Logistics payment is confirmed",
    heading: "Payment confirmed",
    actionLabel: "View payment details",
    safetyNote: customerSafetyNote,
    details: ["orderReference", "amount", "paymentStatus"]
  },
  additional_fee_request: {
    badge: "Additional charge",
    subject: "Review an approved Dovid Logistics delivery charge",
    heading: "An additional delivery charge needs your review",
    actionLabel: "Review and pay charge",
    safetyNote: customerSafetyNote,
    details: ["orderReference", "amount", "reason"]
  },
  redelivery_scheduled: {
    badge: "Redelivery scheduled",
    subject: "Your Dovid Logistics redelivery is scheduled",
    heading: "Your redelivery has been arranged",
    actionLabel: "View redelivery details",
    safetyNote: customerSafetyNote,
    details: ["orderReference", "trackingReference", "scheduledAt"]
  },
  "dispatch.approval_requested": {
    badge: "Dispatch approval needed",
    subject: ({ metadata }) => `Route approval needed${metadataText(metadata, "referenceCode") ? ` · ${metadataText(metadata, "referenceCode")}` : ""}`,
    heading: "A delivery route needs review",
    actionLabel: "Open Dispatch Control",
    safetyNote: staffSafetyNote,
    details: ["requestReference", "route"]
  },
  "dispatch.approval_queue": {
    badge: "Dispatch queue",
    subject: "Dovid Logistics routes are waiting for dispatch review",
    heading: "Route approvals are waiting",
    actionLabel: "Review pending routes",
    safetyNote: staffSafetyNote,
    details: ["pendingCount", "requestReference"]
  },
  dispatch_request_approved: {
    badge: "Route approved",
    subject: "Your Dovid Logistics route is approved",
    heading: "Continue your delivery booking",
    actionLabel: "Continue booking",
    safetyNote: "Your delivery is not confirmed until you finish the booking. Dovid Logistics will not charge you before you choose an approved payment option.",
    details: ["requestReference", "route"]
  },
  dispatch_request_rejected: {
    badge: "Route decision",
    subject: "Update on your Dovid Logistics route request",
    heading: "We could not approve this route",
    actionLabel: "Plan another route",
    safetyNote: "No order was created and no payment was taken for this request.",
    details: ["requestReference", "reason"]
  },
  website_enquiry_received: {
    badge: ({ metadata }) => `New ${enquiryKind(metadata)} enquiry`,
    subject: ({ metadata }) => {
      const topic = metadataText(metadata, "enquirySubject");
      return `New Dovid Logistics ${enquiryKind(metadata)} enquiry${topic ? `: ${topic.slice(0, 120)}` : ""}`;
    },
    heading: ({ metadata }) => `New ${enquiryKind(metadata)} enquiry`,
    actionLabel: "Open enquiries",
    safetyNote: "Customer contact details are confidential. Reply only through approved Dovid Logistics channels.",
    details: []
  },
  website_enquiry_acknowledged: {
    badge: ({ metadata }) => `${humanize(enquiryKind(metadata))} enquiry received`,
    subject: "We received your Dovid Logistics enquiry",
    heading: "Thank you — your message is with our team",
    safetyNote: "Our team will reply using the contact details you provided. You do not need to sign in or make a payment for an enquiry.",
    details: []
  },
  staff_invitation_existing_user: {
    badge: "Private staff invitation",
    subject: ({ metadata }) => `You've been invited as a Dovid Logistics ${staffRole(metadata)}`,
    heading: ({ metadata }) => `Join Dovid Logistics as ${staffRole(metadata) === "rider" ? "a rider" : "an administrator"}`,
    actionLabel: "Review staff invitation",
    safetyNote: "Sign in with the existing account for this email. Staff access remains inactive until identity checks and Super Admin approval are complete.",
    details: ["staffRole", "expiresAt"]
  },
  production_readiness_test: {
    badge: "Email system check",
    subject: "Dovid Logistics email delivery check",
    heading: "Email delivery check",
    safetyNote: "This controlled message checks Dovid Logistics email delivery. No customer action or payment is required.",
    details: []
  }
} satisfies Record<string, EmailPurpose>;

export function getTransactionalEmailPurpose(eventType: string): EmailPurpose {
  const purpose = transactionalEmailPurposes[eventType as keyof typeof transactionalEmailPurposes];
  if (!purpose) throw new UnsupportedTransactionalEmailEventError(eventType);
  return purpose;
}

function resolveText(value: ContextText, context: EmailContext) {
  return typeof value === "function" ? value(context) : value;
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

function formattedDate(value: unknown) {
  if (typeof value !== "string") return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Intl.DateTimeFormat("en-NG", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Lagos" }).format(timestamp) : null;
}

function detailRows(keys: readonly DetailKey[], metadata: Record<string, unknown>) {
  const requestReference = metadataText(metadata, "referenceCode") ?? metadataText(metadata, "reference") ?? metadataText(metadata, "firstReference");
  const pickup = metadataText(metadata, "pickupAddress");
  const destination = metadataText(metadata, "deliveryAddress");
  const route = pickup && destination ? `${pickup} → ${destination}` : pickup ?? destination;
  const values: Record<DetailKey, [string, string | null]> = {
    orderReference: ["Order", metadataText(metadata, "orderReference")],
    trackingReference: ["Tracking", metadataText(metadata, "trackingReference")],
    requestReference: ["Request", requestReference],
    route: ["Route", route],
    amount: ["Amount", money(metadata.amountMinor, metadata.currency)],
    paymentStatus: ["Payment", metadataText(metadata, "paymentStatus") ? humanize(String(metadata.paymentStatus)) : null],
    reason: ["Reason", metadataText(metadata, "reason")],
    scheduledAt: ["Scheduled for", formattedDate(metadata.scheduledAt)],
    pendingCount: ["Pending routes", typeof metadata.pendingCount === "number" ? String(metadata.pendingCount) : null],
    staffRole: ["Role", humanize(staffRole(metadata))],
    expiresAt: ["Invitation expires", formattedDate(metadata.expiresAt)]
  };
  return keys.map((key) => values[key]).filter((row): row is [string, string] => Boolean(row[1]));
}

export function renderTransactionalEmail(input: EmailTemplateInput) {
  const metadata = input.metadata ?? {};
  const purpose = getTransactionalEmailPurpose(input.eventType);
  const context = { metadata };
  const subject = resolveText(purpose.subject, context);
  const heading = resolveText(purpose.heading, context);
  const badge = resolveText(purpose.badge, context);
  const actionPath = safeActionPath(metadata.actionPath);
  const actionUrl = purpose.actionLabel && actionPath ? new URL(actionPath, publicEnv.NEXT_PUBLIC_APP_URL).toString() : null;
  const body = removeLegacyActionSuffix(input.body, actionPath);
  const rows = detailRows(purpose.details, metadata);
  const summary = rows.length ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;background:#F8FAFC;border-radius:16px;padding:8px 20px">${rows.map(([label, value]) => `<tr><td style="padding:10px 0;color:#64748B;font-size:13px;vertical-align:top">${escapeHtml(label)}</td><td style="padding:10px 0;color:#0B1F44;font-size:14px;font-weight:700;text-align:right;vertical-align:top">${escapeHtml(value)}</td></tr>`).join("")}</table>` : "";
  const action = actionUrl ? `<p style="margin:24px 0 0"><a href="${escapeHtml(actionUrl)}" style="display:inline-block;background:#FF6A00;color:#FFFFFF;text-decoration:none;border-radius:999px;padding:14px 22px;font-size:15px;font-weight:700">${escapeHtml(purpose.actionLabel)}</a></p>` : "";
  const html = `<!doctype html><html><body style="margin:0;background:#F8FAFC;font-family:Arial,sans-serif;color:#15243B"><div style="display:none;max-height:0;overflow:hidden">${escapeHtml(subject)}</div><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:24px 12px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:#FFFFFF;border-radius:24px;overflow:hidden"><tr><td style="background:#0B1F44;padding:24px 28px;color:#FFFFFF"><div style="font-size:21px;font-weight:800">Dovid <span style="color:#FF6A00">Logistics</span></div></td></tr><tr><td style="padding:32px 28px"><div style="display:inline-block;border-radius:999px;background:#FFF1E8;color:#C54E00;padding:7px 12px;font-size:12px;font-weight:700;text-transform:uppercase">${escapeHtml(badge)}</div><h1 style="margin:18px 0 12px;color:#0B1F44;font-size:28px;line-height:1.2">${escapeHtml(heading)}</h1>${renderBody(body)}${summary}${action}<p style="margin:24px 0 0;color:#64748B;font-size:13px;line-height:1.6">${escapeHtml(purpose.safetyNote)}</p></td></tr><tr><td style="border-top:1px solid #E2E8F0;padding:20px 28px;color:#64748B;font-size:12px;line-height:1.6">Dovid Logistics · Ibadan, Oyo State<br>Need help? ${escapeHtml(siteConfig.support.email)} · ${escapeHtml(siteConfig.support.phone)}</td></tr></table></td></tr></table></body></html>`;
  const textRows = rows.map(([label, value]) => `${label}: ${value}`).join("\n");
  const actionText = actionUrl ? `\n\n${purpose.actionLabel}: ${actionUrl}` : "";
  const text = `Dovid Logistics\n${badge}\n\n${heading}\n\n${body}${textRows ? `\n\n${textRows}` : ""}${actionText}\n\n${purpose.safetyNote}\nSupport: ${siteConfig.support.email} · ${siteConfig.support.phone}`;
  return { subject, html, text };
}
