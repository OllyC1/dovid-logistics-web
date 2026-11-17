"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ActionFeedback } from "@/components/ui/action-feedback";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { ReasonDialog } from "@/components/ui/reason-dialog";

type Permission = { permission_key: string; description: string };
type Member = { userId: string; email: string; fullName: string; phone: string | null; role: "super_admin" | "admin" | "rider"; status: "pending" | "active" | "suspended" | "revoked"; identityVerifiedAt: string | null; suspensionReason: string | null; permissions: string[] };
type Invitation = { id: string; email: string; role: string; status: string; expiresAt: string; bootstrap: boolean };
type AuditEvent = { id: string; action: string; actor: string; target: string | null; createdAt: string };

function title(value: string) { return value.replaceAll("_", " ").replaceAll(".", " · ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }

export function TeamManagement({ currentUserId, currentRole, currentPermissions, members, invitations, permissionCatalog, audit }: { currentUserId: string; currentRole: "super_admin" | "admin" | "rider"; currentPermissions: readonly string[]; members: Member[]; invitations: Invitation[]; permissionCatalog: Permission[]; audit: AuditEvent[] }) {
  const router = useRouter();
  const [feedback, setFeedback] = useState<{ title: string; message: string; ok: boolean } | null>(null);
  const [pending, setPending] = useState(false);
  const canInviteAdmin = currentRole === "super_admin";
  const canInviteRider = currentRole === "super_admin" || currentPermissions.includes("riders.invite");
  const openInvitations = invitations.filter((invitation) => ["pending", "sent"].includes(invitation.status));
  const administrators = members.filter((member) => member.role !== "rider");
  const riders = members.filter((member) => member.role === "rider");
  const availableRoles = useMemo(() => [canInviteAdmin ? "admin" : null, canInviteRider ? "rider" : null].filter(Boolean) as string[], [canInviteAdmin, canInviteRider]);
  const [selectedRole, setSelectedRole] = useState(availableRoles[0] ?? "rider");
  const [statusAction, setStatusAction] = useState<{ userId: string; nextStatus: "active" | "suspended" | "revoked" } | null>(null);

  async function request(url: string, init: RequestInit, success: { title: string; message: string }) {
    setPending(true);
    setFeedback(null);
    try {
      const response = await fetch(url, init);
      const body = await response.json().catch(() => ({}));
      if (!response.ok) { setFeedback({ title: "We could not complete that change", message: body.error ?? "Please check the details and try again.", ok: false }); return false; }
      setFeedback({ ...success, ok: true });
      router.refresh();
      return true;
    } catch {
      setFeedback({ title: "Connection interrupted", message: "The change was not confirmed. Check your connection and try again.", ok: false });
      return false;
    } finally {
      setPending(false);
    }
  }

  async function invite(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const email = String(form.get("email") ?? "").trim();
    const permissions = selectedRole === "admin" ? form.getAll("permissions").map(String) : [];
    const sent = await request("/api/admin/team/invitations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, role: selectedRole, permissions }) }, { title: `${title(selectedRole)} invitation sent`, message: `A secure setup link was sent to ${email}. It expires in 24 hours. Access stays inactive until the invitation is accepted and a Super Admin completes the approval.` });
    if (sent) formElement.reset();
  }

  async function activate(event: React.FormEvent<HTMLFormElement>, userId: string) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await request(`/api/admin/team/members/${userId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "activate", verificationMethod: form.get("verificationMethod"), verificationReference: form.get("verificationReference"), reason: form.get("reason") }) }, { title: "Staff access activated", message: "Identity checks were recorded and the correct workspace is now available to this team member." });
  }

  async function status(userId: string, nextStatus: "active" | "suspended" | "revoked", reason: string) {
    const changed = await request(`/api/admin/team/members/${userId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "status", status: nextStatus, reason }) }, { title: `Staff account ${nextStatus}`, message: "The change was saved and recorded in the access history." });
    if (changed) setStatusAction(null);
  }

  async function permissions(event: React.FormEvent<HTMLFormElement>, userId: string) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await request(`/api/admin/team/members/${userId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "permissions", permissions: form.getAll("permissions").map(String), reason: form.get("reason") }) }, { title: "Administrator permissions updated", message: "The new access permissions are active and the change was added to the audit history." });
  }

  async function profile(event: React.FormEvent<HTMLFormElement>, userId: string) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const preferredName = String(form.get("preferredName") ?? "").trim();
    const firstName = String(form.get("firstName") ?? "").trim();
    const lastName = String(form.get("lastName") ?? "").trim();
    const fullName = preferredName ? `${firstName} ${lastName} (${preferredName})` : `${firstName} ${lastName}`;
    await request(`/api/admin/team/members/${userId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "profile", firstName, lastName, preferredName: preferredName || null, fullName, phone: String(form.get("phone") ?? "").trim() || null, reason: form.get("reason") }) }, { title: "Staff details updated", message: "The staff record and audit history now contain the confirmed contact details." });
  }

  return <div>
    <p className="eyebrow">People & access</p>
    <h1 className="mt-2 text-2xl font-extrabold text-navy sm:text-3xl">Team management</h1>
    <p className="mt-3 max-w-3xl text-slate">Invite people by verified email, review their identity, and give only the access they need. New riders stay offline until readiness checks are complete.</p>
    <ActionFeedback feedback={feedback ? { text: `${feedback.title}. ${feedback.message}`, ok: feedback.ok } : null} pending={pending} pendingText="Saving team access…" onDismiss={() => setFeedback(null)} />

    <details className="group mt-8 rounded-3xl bg-white p-4 shadow-sm sm:p-6">
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-4 text-xl font-extrabold text-navy"><span>Invite a team member</span><span aria-hidden="true" className="text-2xl text-orange transition group-open:rotate-45">+</span></summary>
      {availableRoles.length ? <form onSubmit={invite} className="mt-5 grid gap-5">
        <div className="grid gap-4 sm:grid-cols-2"><Field label="Work email" name="email" type="email" autoComplete="off" required /><label className="grid gap-2 text-sm font-semibold text-navy"><span>Role</span><select name="role" value={selectedRole} onChange={(event) => setSelectedRole(event.target.value)} className="min-h-12 rounded-2xl border border-slate/25 bg-white px-4 font-normal">{availableRoles.map((role) => <option key={role} value={role}>{title(role)}</option>)}</select></label></div>
        {canInviteAdmin && selectedRole === "admin" ? <details className="group rounded-2xl border border-navy/10 p-4"><summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 font-bold text-navy"><span>Choose administrator permissions</span><span aria-hidden="true" className="text-orange transition group-open:rotate-45">+</span></summary><fieldset className="mt-4 grid gap-3"><legend className="sr-only">Admin permissions</legend><p className="text-sm text-slate">Choose only the areas this administrator should manage.</p><div className="grid gap-3 sm:grid-cols-2">{permissionCatalog.map((permission) => <label key={permission.permission_key} className="flex min-h-12 gap-3 rounded-2xl bg-cloud p-4 text-sm"><input type="checkbox" name="permissions" value={permission.permission_key} className="mt-1 size-5 shrink-0" /><span><strong className="block text-navy">{title(permission.permission_key)}</strong><span className="text-slate">{permission.description}</span></span></label>)}</div></fieldset></details> : null}
        {selectedRole === "rider" ? <p className="rounded-2xl bg-cloud p-4 text-sm text-slate">Riders receive delivery access only. They stay inactive until identity and readiness checks are completed.</p> : null}
        <Button type="submit" disabled={pending}>{pending ? "Sending secure invitation…" : `Send ${title(selectedRole)} invitation`}</Button>
      </form> : <p className="mt-4 text-sm text-slate">You do not currently have permission to invite staff.</p>}
    </details>

    <section className="mt-8"><h2 className="text-2xl font-extrabold text-navy">Pending invitations</h2><div className="mt-4 grid gap-4">{openInvitations.map((invitation) => <article key={invitation.id} className="flex flex-wrap items-center justify-between gap-4 rounded-3xl bg-white p-5"><div><p className="font-bold text-navy">{invitation.email}</p><p className="mt-1 text-sm capitalize text-slate">{title(invitation.role)} · expires {new Date(invitation.expiresAt).toLocaleString("en-GB")}</p></div>{!invitation.bootstrap ? <div className="flex gap-2"><Button type="button" variant="outline" disabled={pending} onClick={() => request(`/api/admin/team/invitations/${invitation.id}`, { method: "POST" }, { title: "Invitation sent again", message: `A fresh secure setup email was sent to ${invitation.email}.` })}>Resend</Button><Button type="button" variant="ghost" disabled={pending} onClick={() => request(`/api/admin/team/invitations/${invitation.id}`, { method: "DELETE" }, { title: "Invitation revoked", message: "The setup link can no longer be used." })}>Revoke</Button></div> : <span className="rounded-full bg-orange/10 px-3 py-2 text-xs font-bold text-orange">Founder setup</span>}</article>)}{!openInvitations.length ? <p className="rounded-3xl bg-white p-6 text-sm text-slate">No invitations are waiting.</p> : null}</div></section>

    <StaffGroup title="Administrators" currentUserId={currentUserId} members={administrators} permissionCatalog={permissionCatalog} currentRole={currentRole} pending={pending} onActivate={activate} onStatus={(userId, nextStatus) => setStatusAction({ userId, nextStatus })} onPermissions={permissions} onProfile={profile} />
    <StaffGroup title="Riders" currentUserId={currentUserId} members={riders} permissionCatalog={permissionCatalog} currentRole={currentRole} pending={pending} onActivate={activate} onStatus={(userId, nextStatus) => setStatusAction({ userId, nextStatus })} onPermissions={permissions} onProfile={profile} />

    <ReasonDialog
      open={Boolean(statusAction)}
      title={`${title(statusAction?.nextStatus ?? "update")} this staff account?`}
      description="This access change takes effect immediately and is written to the staff audit history. Record the verified operational reason."
      confirmLabel={title(statusAction?.nextStatus ?? "Continue")}
      pending={pending}
      onCancel={() => setStatusAction(null)}
      onConfirm={(reason) => statusAction ? status(statusAction.userId, statusAction.nextStatus, reason) : undefined}
    />

    <section className="mt-10"><h2 className="text-xl font-extrabold text-navy sm:text-2xl">Access history</h2><div className="mt-4 grid gap-3 sm:hidden">{audit.map((event) => <article key={event.id} className="rounded-2xl bg-white p-4 shadow-sm"><p className="text-sm font-extrabold text-navy">{title(event.action)}</p><p className="mt-2 break-words text-sm text-slate"><strong className="text-navy">Account:</strong> {event.target ?? "—"}</p><p className="mt-1 break-words text-sm text-slate"><strong className="text-navy">By:</strong> {event.actor}</p><p className="mt-2 text-xs text-slate">{new Date(event.createdAt).toLocaleString("en-GB")}</p></article>)}{!audit.length ? <p className="rounded-2xl bg-white p-5 text-sm text-slate">No staff activity recorded yet.</p> : null}</div><div className="mt-4 hidden overflow-x-auto rounded-3xl bg-white p-5 sm:block"><table className="w-full min-w-[680px] text-left text-sm"><thead><tr className="text-slate"><th className="pb-3">When</th><th>Action</th><th>By</th><th>Account</th></tr></thead><tbody>{audit.map((event) => <tr key={event.id} className="border-t border-navy/8"><td className="py-3">{new Date(event.createdAt).toLocaleString("en-GB")}</td><td>{title(event.action)}</td><td>{event.actor}</td><td>{event.target ?? "—"}</td></tr>)}</tbody></table>{!audit.length ? <p className="py-5 text-slate">No staff activity recorded yet.</p> : null}</div></section>
  </div>;
}

function StaffGroup({ title: groupTitle, currentUserId, members, permissionCatalog, currentRole, pending, onActivate, onStatus, onPermissions, onProfile }: { title: string; currentUserId: string; members: Member[]; permissionCatalog: Permission[]; currentRole: string; pending: boolean; onActivate: (event: React.FormEvent<HTMLFormElement>, userId: string) => void; onStatus: (userId: string, status: "active" | "suspended" | "revoked") => void; onPermissions: (event: React.FormEvent<HTMLFormElement>, userId: string) => void; onProfile: (event: React.FormEvent<HTMLFormElement>, userId: string) => void }) {
  return <section className="mt-10"><h2 className="text-xl font-extrabold text-navy sm:text-2xl">{groupTitle}</h2><div className="mt-4 grid gap-5">{members.map((member) => <details key={member.userId} className="group rounded-3xl bg-white p-4 shadow-sm sm:p-6"><summary className="flex min-h-12 cursor-pointer list-none items-start justify-between gap-4"><div className="min-w-0"><h3 className="break-words text-lg font-extrabold text-navy">{member.fullName}</h3><p className="mt-1 break-all text-sm text-slate">{member.email}</p><p className="mt-2 text-xs font-bold uppercase tracking-wider text-orange">{title(member.role)} · {title(member.status)}{member.userId === currentUserId ? " · You" : ""}</p></div><span aria-hidden="true" className="mt-1 shrink-0 text-2xl text-orange transition group-open:rotate-45">+</span></summary><div className="mt-5 border-t border-navy/8 pt-5"><div className="grid gap-4 sm:flex sm:items-start sm:justify-between"><div className="min-w-0"><p className="break-words text-sm text-slate">{member.phone ? `Phone: ${member.phone}` : "Phone not provided"}</p>{member.suspensionReason ? <p className="mt-2 text-sm text-red-700">{member.suspensionReason}</p> : null}</div><div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">{member.status === "active" && member.userId !== currentUserId && member.role !== "super_admin" ? <Button type="button" variant="outline" disabled={pending} onClick={() => onStatus(member.userId, "suspended")}>Suspend</Button> : null}{member.status === "suspended" && member.userId !== currentUserId ? <Button type="button" variant="outline" disabled={pending} onClick={() => onStatus(member.userId, "active")}>Reactivate</Button> : null}{member.role !== "super_admin" && member.userId !== currentUserId && member.status !== "revoked" ? <Button type="button" variant="ghost" disabled={pending} onClick={() => onStatus(member.userId, "revoked")}>Revoke</Button> : null}</div></div>
      {currentRole === "super_admin" && member.role !== "super_admin" && member.status !== "revoked" ? <details className="group/profile mt-5 rounded-2xl border border-navy/10 p-4"><summary className="flex min-h-11 cursor-pointer list-none items-center justify-between font-bold text-navy"><span>Contact and identity details</span><span aria-hidden="true" className="text-orange transition group-open/profile:rotate-45">+</span></summary><form onSubmit={(event) => onProfile(event, member.userId)} className="mt-4 grid gap-4 sm:grid-cols-2"><Field label="First name" name="firstName" required /><Field label="Last name" name="lastName" required /><Field label="Preferred name (optional)" name="preferredName" /><Field label="Mobile phone" name="phone" type="tel" defaultValue={member.phone ?? ""} required={member.role === "rider"} /><Field label="Reason for update" name="reason" placeholder="Confirmed during staff onboarding" className="sm:col-span-2" required /><Button type="submit" variant="secondary" disabled={pending} className="sm:col-span-2">Save confirmed details</Button></form></details> : null}
      {member.status === "pending" ? <form onSubmit={(event) => onActivate(event, member.userId)} className="mt-5 grid gap-4 rounded-2xl bg-cloud p-5 sm:grid-cols-2"><div className="sm:col-span-2"><p className="font-bold text-navy">Final approval</p><p className="mt-1 text-sm text-slate">The invitation has been accepted. Record the identity check, then activate the correct staff workspace. MFA is required only for the Super Admin.</p></div><Field label="Verification method" name="verificationMethod" placeholder="In-person ID check" required /><Field label="Verification reference" name="verificationReference" placeholder="Internal evidence reference" required /><Field label="Activation reason" name="reason" placeholder="Identity and onboarding checks completed" className="sm:col-span-2" required /><Button type="submit" disabled={pending} className="sm:col-span-2">Approve and activate</Button></form> : null}
      {currentRole === "super_admin" && member.role === "admin" && member.status !== "revoked" ? <details className="group/permissions mt-5 rounded-2xl border border-navy/10 p-4"><summary className="flex min-h-11 cursor-pointer list-none items-center justify-between font-bold text-navy"><span>Administrator permissions</span><span aria-hidden="true" className="text-orange transition group-open/permissions:rotate-45">+</span></summary><form onSubmit={(event) => onPermissions(event, member.userId)} className="mt-4 grid gap-4"><div className="grid gap-2 sm:grid-cols-2">{permissionCatalog.map((permission) => <label key={permission.permission_key} className="flex min-h-11 items-center gap-3 text-sm text-slate"><input type="checkbox" name="permissions" value={permission.permission_key} defaultChecked={member.permissions.includes(permission.permission_key)} className="size-5 shrink-0" />{title(permission.permission_key)}</label>)}</div><Field label="Reason for this permission set" name="reason" placeholder="Approved responsibilities for this administrator" required /><Button type="submit" variant="secondary" disabled={pending}>Save permissions</Button></form></details> : null}</div>
    </details>)}{!members.length ? <p className="rounded-3xl bg-white p-6 text-sm text-slate">No {groupTitle.toLowerCase()} have been added.</p> : null}</div></section>;
}
