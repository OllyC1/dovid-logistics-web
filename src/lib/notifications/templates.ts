import { publicEnv } from "@/lib/env";
import { siteConfig } from "@/config/site";

export type EmailTemplateInput = { eventType: string; heading: string; body: string; metadata?: Record<string, unknown> | null };

function escapeHtml(value: unknown) {
  return String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] ?? character);
}

function money(amountMinor: unknown, currency: unknown) {
  if (typeof amountMinor !== "number" || !Number.isFinite(amountMinor)) return null;
  return new Intl.NumberFormat("en-NG", { style: "currency", currency: String(currency || "NGN") }).format(amountMinor / 100);
}

export function renderTransactionalEmail(input: EmailTemplateInput) {
  const metadata = input.metadata ?? {};
  const actionPath = typeof metadata.actionPath === "string" && metadata.actionPath.startsWith("/") ? metadata.actionPath : "/account";
  const actionUrl = `${publicEnv.NEXT_PUBLIC_APP_URL}${actionPath}`;
  const orderReference = typeof metadata.orderReference === "string" ? metadata.orderReference : null;
  const trackingReference = typeof metadata.trackingReference === "string" ? metadata.trackingReference : null;
  const amount = money(metadata.amountMinor, metadata.currency);
  const rows = [orderReference ? ["Order", orderReference] : null, trackingReference ? ["Tracking", trackingReference] : null, amount ? ["Amount", amount] : null, typeof metadata.paymentStatus === "string" ? ["Payment", metadata.paymentStatus.replaceAll("_", " ")] : null].filter(Boolean) as string[][];
  const summary = rows.length ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;background:#F8FAFC;border-radius:16px;padding:8px 20px">${rows.map(([label, value]) => `<tr><td style="padding:10px 0;color:#64748B;font-size:13px">${escapeHtml(label)}</td><td style="padding:10px 0;color:#0B1F44;font-size:14px;font-weight:700;text-align:right">${escapeHtml(value)}</td></tr>`).join("")}</table>` : "";
  const html = `<!doctype html><html><body style="margin:0;background:#F8FAFC;font-family:Arial,sans-serif;color:#15243B"><div style="display:none;max-height:0;overflow:hidden">${escapeHtml(input.body)}</div><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:24px 12px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:#FFFFFF;border-radius:24px;overflow:hidden"><tr><td style="background:#0B1F44;padding:24px 28px;color:#FFFFFF"><div style="font-size:21px;font-weight:800">Dovid <span style="color:#FF6A00">Logistics</span></div></td></tr><tr><td style="padding:32px 28px"><div style="display:inline-block;border-radius:999px;background:#FFF1E8;color:#C54E00;padding:7px 12px;font-size:12px;font-weight:700;text-transform:uppercase">Delivery update</div><h1 style="margin:18px 0 12px;color:#0B1F44;font-size:28px;line-height:1.2">${escapeHtml(input.heading)}</h1><p style="margin:0;color:#475569;font-size:16px;line-height:1.7">${escapeHtml(input.body)}</p>${summary}<a href="${escapeHtml(actionUrl)}" style="display:inline-block;background:#FF6A00;color:#FFFFFF;text-decoration:none;border-radius:999px;padding:14px 22px;font-size:15px;font-weight:700">View secure update</a><p style="margin:24px 0 0;color:#64748B;font-size:13px;line-height:1.6">For your safety, use only links that open the Dovid Logistics website. We will never ask you to send money to a rider&apos;s personal account.</p></td></tr><tr><td style="border-top:1px solid #E2E8F0;padding:20px 28px;color:#64748B;font-size:12px;line-height:1.6">Dovid Logistics · Ibadan, Oyo State<br>Need help? ${escapeHtml(siteConfig.support.email)} · ${escapeHtml(siteConfig.support.phone)}</td></tr></table></td></tr></table></body></html>`;
  const textRows = rows.map(([label, value]) => `${label}: ${value}`).join("\n");
  const text = `Dovid Logistics\n\n${input.heading}\n\n${input.body}${textRows ? `\n\n${textRows}` : ""}\n\nView secure update: ${actionUrl}\n\nFor your safety, we will never ask you to send money to a rider's personal account.\nSupport: ${siteConfig.support.email} · ${siteConfig.support.phone}`;
  return { html, text };
}
