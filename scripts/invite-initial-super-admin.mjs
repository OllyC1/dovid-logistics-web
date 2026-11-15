import { createClient } from "@supabase/supabase-js";

function argument(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const email = argument("email")?.trim().toLowerCase();
const approvalReference = argument("approval-reference")?.trim();
const appUrl = (argument("app-url") ?? process.env.NEXT_PUBLIC_APP_URL)?.replace(/\/$/, "");
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!email || !email.includes("@") || !approvalReference || approvalReference.length < 8 || !appUrl || !supabaseUrl || !publishableKey || !serviceRoleKey) {
  throw new Error("Required bootstrap arguments or environment variables are missing.");
}

const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
const mail = createClient(supabaseUrl, publishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
const redirectTo = `${appUrl}/auth/callback?next=/staff/setup`;

async function findUser() {
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error("The existing Supabase identity could not be checked.");
    const user = data.users.find((candidate) => candidate.email?.toLowerCase() === email);
    if (user) return user;
    if (data.users.length < 1000) return null;
  }
  throw new Error("The Supabase identity lookup exceeded its safe limit.");
}

let user = await findUser();
let invitationAlreadyDelivered = false;
if (!user) {
  const invited = await admin.auth.admin.inviteUserByEmail(email, { redirectTo, data: { onboarding: "initial_super_admin" } });
  if (invited.error || !invited.data.user) throw new Error("Supabase could not deliver the secure founder invitation.");
  user = invited.data.user;
  invitationAlreadyDelivered = true;
}

const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
const prepared = await admin.rpc("prepare_initial_super_admin_bootstrap", {
  target_user_id: user.id,
  target_email: email,
  approval_reference: approvalReference,
  invitation_expires_at: expiresAt
});
if (prepared.error) throw new Error(`The authorized bootstrap record could not be prepared: ${prepared.error.message}`);
if (prepared.data?.status === "completed") {
  process.stdout.write("The initial Super Admin bootstrap is already complete. No email was sent.\n");
  process.exit(0);
}

if (!invitationAlreadyDelivered) {
  const delivered = user.email_confirmed_at
    ? await mail.auth.resetPasswordForEmail(email, { redirectTo })
    : await mail.auth.resend({ type: "signup", email, options: { emailRedirectTo: redirectTo } });
  if (delivered.error) throw new Error("The bootstrap was recorded, but Supabase could not deliver the secure setup email.");
}

process.stdout.write("Secure, time-limited setup instructions were sent to the authorized company email. No password or setup token was displayed.\n");
