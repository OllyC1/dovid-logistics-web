import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { removeUnregisteredInvitationIdentity } from "@/features/staff/invitation-identity";

function client({ memberships = 0, invitations = 0, lookupError = null, deleteError = null }: { memberships?: number; invitations?: number; lookupError?: Error | null; deleteError?: Error | null } = {}) {
  const deleteUser = vi.fn().mockResolvedValue({ error: deleteError });
  const admin = {
    from: vi.fn((table: string) => ({
      select: vi.fn(() => ({
        eq: vi.fn().mockResolvedValue({ count: table === "staff_memberships" ? memberships : invitations, error: lookupError }),
      })),
    })),
    auth: { admin: { deleteUser } },
  };
  return { admin: admin as unknown as SupabaseClient, deleteUser };
}

describe("failed staff invitation identity cleanup", () => {
  it("never deletes a pre-existing customer identity", async () => {
    const { admin, deleteUser } = client();
    await expect(removeUnregisteredInvitationIdentity(admin, { userId: "existing", createdForInvitation: false })).resolves.toBe("not_new");
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it("does not delete an identity referenced by a concurrent staff record", async () => {
    const { admin, deleteUser } = client({ invitations: 1 });
    await expect(removeUnregisteredInvitationIdentity(admin, { userId: "concurrent", createdForInvitation: true })).resolves.toBe("referenced");
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it("removes only a newly created, unregistered invitation identity", async () => {
    const { admin, deleteUser } = client();
    await expect(removeUnregisteredInvitationIdentity(admin, { userId: "orphan", createdForInvitation: true })).resolves.toBe("removed");
    expect(deleteUser).toHaveBeenCalledWith("orphan");
  });

  it("fails closed when references cannot be checked", async () => {
    const { admin, deleteUser } = client({ lookupError: new Error("unavailable") });
    await expect(removeUnregisteredInvitationIdentity(admin, { userId: "unknown", createdForInvitation: true })).resolves.toBe("failed");
    expect(deleteUser).not.toHaveBeenCalled();
  });
});
