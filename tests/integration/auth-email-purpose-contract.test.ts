import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const config = readFileSync("supabase/config.toml", "utf8");

const authenticationTemplates = {
  confirmation: ["confirmation.html", "Verify your email"],
  recovery: ["recovery.html", "Reset your password"],
  invite: ["invite.html", "Accept secure invitation"],
  magic_link: ["magic-link.html", "Secure sign-in link"],
  email_change: ["email-change.html", "Confirm your new email"],
  reauthentication: ["reauthentication.html", "Confirm it is really you"],
} as const;

const securityNotifications = {
  password_changed: ["password-changed.html", "Your password was changed"],
  email_changed: ["email-changed.html", "Your email address was changed"],
  phone_changed: ["phone-changed.html", "Your phone number was changed"],
  mfa_factor_enrolled: ["mfa-factor-enrolled.html", "A verification method was added"],
  mfa_factor_unenrolled: ["mfa-factor-unenrolled.html", "A verification method was removed"],
  identity_linked: ["identity-linked.html", "A sign-in method was linked"],
  identity_unlinked: ["identity-unlinked.html", "A sign-in method was removed"],
} as const;

function template(fileName: string) {
  return readFileSync(`supabase/templates/${fileName}`, "utf8");
}

function configSection(name: string) {
  const start = config.indexOf(`[${name}]`);
  expect(start, `${name} must be configured`).toBeGreaterThanOrEqual(0);
  const next = config.indexOf("\n[", start + name.length + 2);
  return config.slice(start, next === -1 ? undefined : next);
}

describe("purpose-specific Supabase Auth email contract", () => {
  it.each(Object.entries(authenticationTemplates))("configures the %s authentication purpose", (purpose, [fileName, marker]) => {
    const section = configSection(`auth.email.template.${purpose}`);
    expect(section).toContain(`content_path = "./supabase/templates/${fileName}"`);
    const content = template(fileName);
    expect(content).toContain(marker);
    expect(content).toContain("Dovid <span");
    expect(content).not.toMatch(/Delivery update|View secure update/i);
  });

  it.each(Object.entries(securityNotifications))("enables and configures the %s security purpose", (purpose, [fileName, marker]) => {
    const section = configSection(`auth.email.notification.${purpose}`);
    expect(section).toContain("enabled = true");
    expect(section).toContain(`content_path = "./templates/${fileName}"`);
    const content = template(fileName);
    expect(content).toContain(marker);
    expect(content).toContain("Dovid <span");
    expect(content).not.toMatch(/Delivery update|View secure update/i);
  });

  it("keeps each Auth and security email purpose visibly distinct", () => {
    const markers = [...Object.values(authenticationTemplates), ...Object.values(securityNotifications)].map(([, marker]) => marker);
    expect(new Set(markers).size).toBe(markers.length);
  });
});
