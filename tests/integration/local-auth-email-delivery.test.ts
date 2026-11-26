import { createHmac, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { afterAll, describe, expect, it } from "vitest";

const enabled = process.env.RUN_LOCAL_AUTH_EMAIL_E2E === "true";
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const mailpitUrl = "http://127.0.0.1:54324";
const createdUserIds = new Set<string>();

type MailpitMessage = { ID: string; Subject?: string; To?: Array<{ Address?: string }> };

function client() {
  return createClient(supabaseUrl, publishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

function admin() {
  return createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function createConfirmedUser(email: string, password: string) {
  const created = await admin().auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error) throw created.error;
  createdUserIds.add(created.data.user.id);
  return created.data.user;
}

async function waitForEmail(email: string, subject: string) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const response = await fetch(`${mailpitUrl}/api/v1/messages`);
    if (response.ok) {
      const mailbox = await response.json() as { messages?: MailpitMessage[] };
      const message = mailbox.messages?.find((item) => item.Subject?.includes(subject) && item.To?.some((recipient) => recipient.Address?.toLowerCase() === email.toLowerCase()));
      if (message) {
        const detailResponse = await fetch(`${mailpitUrl}/api/v1/message/${encodeURIComponent(message.ID)}`);
        if (!detailResponse.ok) throw new Error(`Mailpit could not open ${subject}`);
        return detailResponse.json() as Promise<{ HTML?: string; Text?: string }>;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Mailpit did not receive "${subject}" for the controlled local address`);
}

function totp(secret: string, timestamp = Date.now()) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const normalized = secret.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = "";
  for (const character of normalized) bits += alphabet.indexOf(character).toString(2).padStart(5, "0");
  const bytes: number[] = [];
  for (let index = 0; index + 8 <= bits.length; index += 8) bytes.push(Number.parseInt(bits.slice(index, index + 8), 2));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(timestamp / 30_000)));
  const digest = createHmac("sha1", Buffer.from(bytes)).update(counter).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const value = ((digest[offset] & 0x7f) << 24) | ((digest[offset + 1] & 0xff) << 16) | ((digest[offset + 2] & 0xff) << 8) | (digest[offset + 3] & 0xff);
  return String(value % 1_000_000).padStart(6, "0");
}

describe.skipIf(!enabled || !supabaseUrl || !publishableKey || !serviceRoleKey)("local Supabase Auth email delivery", () => {
  afterAll(async () => {
    for (const userId of createdUserIds) await admin().auth.admin.deleteUser(userId);
  });

  it("renders every locally exercisable Auth purpose with its own subject and content", async () => {
    const suffix = randomUUID().slice(0, 8);
    const password = `Local-${suffix}-Secure!9Aa`;

    const signupEmail = `signup-${suffix}@example.com`;
    const signup = await client().auth.signUp({ email: signupEmail, password });
    expect(signup.error).toBeNull();
    if (signup.data.user) createdUserIds.add(signup.data.user.id);
    expect((await waitForEmail(signupEmail, "Verify your Dovid Logistics email")).HTML).toContain("Verify your email");

    const inviteEmail = `invite-${suffix}@example.com`;
    const invited = await admin().auth.admin.inviteUserByEmail(inviteEmail, { data: { staff_role: "rider" }, redirectTo: "https://dovidlogistics.com/auth/callback" });
    expect(invited.error).toBeNull();
    if (invited.data.user) createdUserIds.add(invited.data.user.id);
    expect((await waitForEmail(inviteEmail, "You've been invited to Dovid Logistics")).HTML).toContain("Welcome to the Dovid rider team");

    const magicEmail = `magic-${suffix}@example.com`;
    await createConfirmedUser(magicEmail, password);
    const magic = await client().auth.signInWithOtp({ email: magicEmail, options: { shouldCreateUser: false } });
    expect(magic.error).toBeNull();
    expect((await waitForEmail(magicEmail, "Your secure Dovid Logistics sign-in link")).HTML).toContain("Secure sign-in link");

    const securedEmail = `secured-${suffix}@example.com`;
    const secured = await createConfirmedUser(securedEmail, password);
    const signedIn = client();
    expect((await signedIn.auth.signInWithPassword({ email: securedEmail, password })).error).toBeNull();

    expect((await signedIn.auth.resetPasswordForEmail(securedEmail, { redirectTo: "https://dovidlogistics.com/auth/callback?next=/reset-password" })).error).toBeNull();
    expect((await waitForEmail(securedEmail, "Reset your Dovid Logistics password")).HTML).toContain("Reset your password");

    expect((await signedIn.auth.reauthenticate()).error).toBeNull();
    const reauthentication = await waitForEmail(securedEmail, "is your Dovid Logistics verification code");
    expect(reauthentication.HTML).toContain("Confirm it is really you");

    expect((await signedIn.auth.updateUser({ password: `${password}-Changed`, current_password: password })).error).toBeNull();
    expect((await waitForEmail(securedEmail, "Your Dovid Logistics password was changed")).HTML).toContain("Secure my account");

    const enrolled = await signedIn.auth.mfa.enroll({ factorType: "totp", friendlyName: `Local purpose test ${suffix}` });
    expect(enrolled.error).toBeNull();
    if (enrolled.error) return;
    const challenge = await signedIn.auth.mfa.challenge({ factorId: enrolled.data.id });
    expect(challenge.error).toBeNull();
    if (challenge.error) return;
    const verified = await signedIn.auth.mfa.verify({ factorId: enrolled.data.id, challengeId: challenge.data.id, code: totp(enrolled.data.totp.secret) });
    expect(verified.error).toBeNull();
    expect((await waitForEmail(securedEmail, "A verification method was added to your Dovid Logistics account")).HTML).toContain("Privileged access");

    expect((await signedIn.auth.mfa.unenroll({ factorId: enrolled.data.id })).error).toBeNull();
    expect((await waitForEmail(securedEmail, "A verification method was removed from your Dovid Logistics account")).HTML).toContain("Super Admin access remains protected");

    expect(secured.id).toMatch(/[0-9a-f-]{36}/);
  }, 60_000);
});
