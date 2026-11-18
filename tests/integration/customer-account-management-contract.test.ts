import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const actions = readFileSync("src/features/account/actions.ts", "utf8");
const addressUi = readFileSync("src/components/account/account-forms.tsx", "utf8");
const notificationUi = readFileSync("src/components/account/notification-actions.tsx", "utf8");
const migration = readFileSync("supabase/migrations/202611180003_customer_notification_read_receipts.sql", "utf8");

describe("customer account management", () => {
  it("authorizes address changes from the authenticated identity and row owner", () => {
    expect(actions).toContain("await supabase.auth.getUser()");
    expect(actions).toContain('.eq("id", parsed.data.id).eq("customer_id", user.id)');
    expect(actions).toContain("updateAddressAction");
    expect(actions).toContain("deleteAddressAction");
  });

  it("gives mobile customers explicit edit and delete confirmation states", () => {
    expect(addressUi).toContain("Save changes");
    expect(addressUi).toContain('role="alertdialog"');
    expect(addressUi).toContain("Existing deliveries will keep their original address");
    expect(addressUi).toContain('className="w-full sm:w-auto"');
  });

  it("allows only the read timestamp to be changed on a customer's own notifications", () => {
    expect(migration).toContain("revoke update on table public.notifications from anon, authenticated");
    expect(migration).toContain("grant update(read_at) on table public.notifications to authenticated");
    expect(migration).toContain("(select auth.uid()) = customer_id");
    expect(notificationUi).toContain("Mark all");
    expect(actions).toContain('.update({ read_at: new Date().toISOString() })');
  });
});
