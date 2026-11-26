import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

const enabled = process.env.RUN_REMOTE_AUTH_EMAIL_SMOKE === "true";
const recipient = process.env.AUTHORIZED_EMAIL_TEST_RECIPIENT?.trim().toLowerCase();
let url = process.env.NEXT_PUBLIC_SUPABASE_URL;
let publishableKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
let serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !publishableKey || !serviceRoleKey) {
  const executable = process.platform === "win32" ? process.env.ComSpec ?? "cmd.exe" : "npx";
  const args = process.platform === "win32"
    ? ["/d", "/s", "/c", "npx.cmd supabase projects api-keys --remote=qbsiddpzkcielqvruqgj --reveal --output json"]
    : ["supabase", "projects", "api-keys", "--remote=qbsiddpzkcielqvruqgj", "--reveal", "--output", "json"];
  const result = spawnSync(executable, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });
  if (result.status !== 0) throw new Error("Supabase API keys could not be loaded for the controlled smoke test.");
  const jsonStart = result.stdout.indexOf("[");
  const keys = JSON.parse(result.stdout.slice(jsonStart));
  const keyValue = (key) => key.api_key ?? key.key ?? key.value;
  publishableKey = keyValue(keys.find((key) => key.type === "publishable" || key.name === "anon" || key.id === "anon"));
  serviceRoleKey = keyValue(keys.find((key) => key.type === "secret" || key.name === "service_role" || key.id === "service_role"));
  url = "https://qbsiddpzkcielqvruqgj.supabase.co";
}

if (!enabled) throw new Error("Set RUN_REMOTE_AUTH_EMAIL_SMOKE=true to authorize this controlled remote test.");
if (!recipient || !recipient.endsWith("@gmail.com")) throw new Error("An authorized Gmail test recipient is required.");
if (!url || !publishableKey || !serviceRoleKey) throw new Error("Supabase credentials are unavailable for the controlled smoke test.");
if (new URL(url).hostname !== "qbsiddpzkcielqvruqgj.supabase.co") throw new Error("Refusing to run against an unexpected Supabase project.");

const [localPart, domain] = recipient.split("@");
const suffix = `${Date.now().toString(36)}-${randomBytes(3).toString("hex")}`;
const email = `${localPart}+dovid-auth-${suffix}@${domain}`;
const password = `${randomBytes(18).toString("base64url")}!9Aa`;
const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
const browser = createClient(url, publishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
let userId;

try {
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { test_only: true, purpose: "auth_email_smoke" } });
  if (created.error) throw created.error;
  userId = created.data.user.id;

  const signedIn = await browser.auth.signInWithPassword({ email, password });
  if (signedIn.error) throw signedIn.error;
  const requestedAt = new Date().toISOString();
  const requested = await browser.auth.reauthenticate();
  if (requested.error) throw requested.error;

  let delivered = false;
  let providerEvent = null;
  for (let attempt = 0; attempt < 45; attempt += 1) {
    const events = await admin.from("email_provider_events")
      .select("event_type,payload,received_at")
      .gte("received_at", requestedAt)
      .order("received_at", { ascending: false })
      .limit(30);
    if (events.error) throw events.error;
    providerEvent = events.data?.find((event) => {
      const payload = event.payload && typeof event.payload === "object" ? event.payload : {};
      const data = payload.data && typeof payload.data === "object" ? payload.data : {};
      const recipients = Array.isArray(data.to) ? data.to : [];
      return recipients.some((value) => String(value).toLowerCase() === email);
    }) ?? null;
    if (providerEvent?.event_type === "email.delivered") {
      delivered = true;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }

  console.log(JSON.stringify({ requested: true, delivered, eventType: providerEvent?.event_type ?? null, testAlias: email }));
  if (!delivered) process.exitCode = 2;
} finally {
  if (userId) {
    await browser.auth.signOut().catch(() => undefined);
    const removed = await admin.auth.admin.deleteUser(userId);
    if (removed.error) throw removed.error;
  }
}
