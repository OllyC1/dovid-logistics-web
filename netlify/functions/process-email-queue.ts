async function processEmailQueue() {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  const secret = process.env.EMAIL_WORKER_SECRET;
  if (!appUrl || !secret) return new Response("Email worker is not configured", { status: 503 });
  const response = await fetch(`${appUrl}/api/internal/email/process`, { method: "POST", headers: { Authorization: `Bearer ${secret}` } });
  return new Response(await response.text(), { status: response.status, headers: { "content-type": "application/json" } });
}

export default processEmailQueue;

export const config = { schedule: "*/5 * * * *" };
