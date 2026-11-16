"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";

type Permission = { permission_key: string; description: string };
type Member = { userId: string; email: string; fullName: string; phone: string | null; role: "super_admin" | "admin" | "rider"; status: "pending" | "active" | "suspended" | "revoked"; identityVerifiedAt: string | null; suspensionReason: string | null; permissions: string[] };
type Invitation = { id: string; email: string; role: string; status: string; expiresAt: string; bootstrap: boolean };
type AuditEvent = { id: string; action: string; actor: string; target: string | null; createdAt: string };

function title(value: string) { return value.replaceAll("_", " ").replaceAll(".", " · ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }

export function TeamManagement({ currentRole, currentPermissions, members, invitations, permissionCatalog, audit }: { currentRole: "super_admin" | "admin" | "rider"; currentPermissions: readonly string[]; members: Member[]; invitations: Invitation[]; permissionCatalog: Permission[]; audit: AuditEvent[] }) {
  const [feedback, setFeedback] = useState<{ message: string; ok: boolean } | null>(null);
  const [pending, setPending] = useState(false);
  const canInviteAdmin = currentRole === "super_admin";
  const canInviteRider = currentRole === "super_admin" || currentPermissions.includes("riders.invite");
  const openInvitations = invitations.filter((invitation) => ["pending", "sent"].includes(invitation.status));
  const administrators = members.filter((member) => member.role !== "rider");
  const riders = members.filter((member) => member.role === "rider");
  const availableRoles = useMemo(() => [canInviteAdmin ? "admin" : null, canInviteRider ? "rider" : null].filter(Boolean) as string[], [canInviteAdmin, canInviteRider]);
  const [selectedRole, setSelectedRole] = useState(availableRoles[0] ?? "rider");

  async function request(url: string, init: RequestInit, success: string) {
    setPending(true);
    setFeedback(null);
    const response = await fetch(url, init);
    const body = await response.json().catch(() => ({}));
    if (!response.ok) { setPending(false); setFeedback({ message: body.error ?? "The staff change could not be completed.", ok: false }); return false; }
    setPending(false);
    setFeedback({ message: success, ok: true });
    window.setTimeout(() => window.location.reload(), 1800);
    return true;
  }

  async function invite(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const permissions = selectedRole === "admin" ? form.getAll("permissions").map(String) : [];
    await request("/api/admin/team/invitations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: form.get("email"), role: selectedRole, permissions }) }, `Secure ${title(selectedRole)} invitation sent. Ask the recipient to check their inbox and spam folder.`);
  }

  async function activate(event: React.FormEvent<HTMLFormElement>, userId: string) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await request(`/api/admin/team/members/${userId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "activate", verificationMethod: form.get("verificationMethod"), verificationReference: form.get("verificationReference"), reason: form.get("reason") }) }, "Staff access activated after verification.");
  }

  async function status(userId: string, nextStatus: "active" | "suspended" | "revoked") {
    const reason = window.prompt(`Give a clear reason to ${nextStatus} this staff account:`)?.trim();
    if (!reason || reason.length < 8) { setFeedback({ message: "Enter a reason of at least 8 characters.", ok: false }); return; }
    await request(`/api/admin/team/members/${userId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "status", status: nextStatus, reason }) }, `Staff account ${nextStatus}.`);
  }

  async function permissions(event: React.FormEvent<HTMLFormElement>, userId: string) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await request(`/api/admin/team/members/${userId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "permissions", permissions: form.getAll("permissions").map(String), reason: form.get("reason") }) }, "Administrator permissions updated.");
  }

  return <div>
    <p className="eyebrow">People & access</p>
    <h1 className="mt-2 text-3xl font-extrabold text-navy">Team management</h1>
    <p className="mt-3 max-w-3xl text-slate">Invite people by verified email, review their identity, and give only the access they need. New riders stay offline until readiness checks are complete.</p>
    {feedback ? <p role="status" aria-live="polite" className={`sticky top-20 z-20 mt-5 rounded-2xl p-4 text-sm font-semibold shadow-lg ${feedback.ok ? "bg-emerald-50 text-emerald-900" : "bg-red-50 text-red-900"}`}>{feedback.message}</p> : null}

    <section className="mt-8 rounded-3xl bg-white p-6 shadow-sm">
      <h2 className="text-xl font-extrabold text-navy">Invite a team member</h2>
      {availableRoles.length ? <form onSubmit={invite} className="mt-5 grid gap-5">
        <div className="grid gap-4 sm:grid-cols-2"><Field label="Work email" name="email" type="email" autoComplete="off" required /><label className="grid gap-2 text-sm font-semibold text-navy"><span>Role</span><select name="role" value={selectedRole} onChange={(event) => setSelectedRole(event.target.value)} className="min-h-12 rounded-2xl border border-slate/25 bg-white px-4 font-normal">{availableRoles.map((role) => <option key={role} value={role}>{title(role)}</option>)}</select></label></div>
        {canInviteAdmin && selectedRole === "admin" ? <fieldset className="grid gap-3"><legend className="text-sm font-bold text-navy">Admin permissions</legend><p className="text-sm text-slate">Choose only the areas this administrator should manage.</p><div className="grid gap-3 sm:grid-cols-2">{permissionCatalog.map((permission) => <label key={permission.permission_key} className="flex gap-3 rounded-2xl bg-cloud p-4 text-sm"><input type="checkbox" name="permissions" value={permission.permission_key} className="mt-1" /><span><strong className="block text-navy">{title(permission.permission_key)}</strong><span className="text-slate">{permission.description}</span></span></label>)}</div></fieldset> : null}
        {selectedRole === "rider" ? <p className="rounded-2xl bg-cloud p-4 text-sm text-slate">Riders receive delivery access only. They stay inactive until identity and readiness checks are completed.</p> : null}
        <Button type="submit" disabled={pending}>{pending ? "Sending invitation…" : `Send ${title(selectedRole)} invitation`}</Button>
      </form> : <p className="mt-4 text-sm text-slate">You do not currently have permission to invite staff.</p>}
    </section>

    <section className="mt-8"><h2 className="text-2xl font-extrabold text-navy">Pending invitations</h2><div className="mt-4 grid gap-4">{openInvitations.map((invitation) => <article key={invitation.id} className="flex flex-wrap items-center justify-between gap-4 rounded-3xl bg-white p-5"><div><p className="font-bold text-navy">{invitation.email}</p><p className="mt-1 text-sm capitalize text-slate">{title(invitation.role)} · expires {new Date(invitation.expiresAt).toLocaleString("en-GB")}</p></div>{!invitation.bootstrap ? <div className="flex gap-2"><Button type="button" variant="outline" disabled={pending} onClick={() => request(`/api/admin/team/invitations/${invitation.id}`, { method: "POST" }, "Invitation resent.")}>Resend</Button><Button type="button" variant="ghost" disabled={pending} onClick={() => request(`/api/admin/team/invitations/${invitation.id}`, { method: "DELETE" }, "Invitation revoked.")}>Revoke</Button></div> : <span className="rounded-full bg-orange/10 px-3 py-2 text-xs font-bold text-orange">Founder setup</span>}</article>)}{!openInvitations.length ? <p className="rounded-3xl bg-white p-6 text-sm text-slate">No invitations are waiting.</p> : null}</div></section>

    <StaffGroup title="Administrators" members={administrators} permissionCatalog={permissionCatalog} currentRole={currentRole} pending={pending} onActivate={activate} onStatus={status} onPermissions={permissions} />
    <StaffGroup title="Riders" members={riders} permissionCatalog={permissionCatalog} currentRole={currentRole} pending={pending} onActivate={activate} onStatus={status} onPermissions={permissions} />

    <section className="mt-10"><h2 className="text-2xl font-extrabold text-navy">Access history</h2><div className="mt-4 overflow-x-auto rounded-3xl bg-white p-5"><table className="w-full min-w-[680px] text-left text-sm"><thead><tr className="text-slate"><th className="pb-3">When</th><th>Action</th><th>By</th><th>Account</th></tr></thead><tbody>{audit.map((event) => <tr key={event.id} className="border-t border-navy/8"><td className="py-3">{new Date(event.createdAt).toLocaleString("en-GB")}</td><td>{title(event.action)}</td><td>{event.actor}</td><td>{event.target ?? "—"}</td></tr>)}</tbody></table>{!audit.length ? <p className="py-5 text-slate">No staff activity recorded yet.</p> : null}</div></section>
  </div>;
}

function StaffGroup({ title: groupTitle, members, permissionCatalog, currentRole, pending, onActivate, onStatus, onPermissions }: { title: string; members: Member[]; permissionCatalog: Permission[]; currentRole: string; pending: boolean; onActivate: (event: React.FormEvent<HTMLFormElement>, userId: string) => void; onStatus: (userId: string, status: "active" | "suspended" | "revoked") => void; onPermissions: (event: React.FormEvent<HTMLFormElement>, userId: string) => void }) {
  return <section className="mt-10"><h2 className="text-2xl font-extrabold text-navy">{groupTitle}</h2><div className="mt-4 grid gap-5">{members.map((member) => <article key={member.userId} className="rounded-3xl bg-white p-6 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-4"><div><h3 className="text-lg font-extrabold text-navy">{member.fullName}</h3><p className="mt-1 text-sm text-slate">{member.email}{member.phone ? ` · ${member.phone}` : ""}</p><p className="mt-2 text-xs font-bold uppercase tracking-wider text-orange">{title(member.role)} · {title(member.status)}</p>{member.suspensionReason ? <p className="mt-2 text-sm text-red-700">{member.suspensionReason}</p> : null}</div><div className="flex flex-wrap gap-2">{member.status === "active" ? <Button type="button" variant="outline" disabled={pending} onClick={() => onStatus(member.userId, "suspended")}>Suspend</Button> : null}{member.status === "suspended" ? <Button type="button" variant="outline" disabled={pending} onClick={() => onStatus(member.userId, "active")}>Reactivate</Button> : null}{member.role !== "super_admin" && member.status !== "revoked" ? <Button type="button" variant="ghost" disabled={pending} onClick={() => onStatus(member.userId, "revoked")}>Revoke</Button> : null}</div></div>
      {member.status === "pending" ? <form onSubmit={(event) => onActivate(event, member.userId)} className="mt-5 grid gap-4 rounded-2xl bg-cloud p-5 sm:grid-cols-2"><Field label="Verification method" name="verificationMethod" placeholder="In-person ID check" required /><Field label="Verification reference" name="verificationReference" placeholder="Internal evidence reference" required /><Field label="Activation reason" name="reason" placeholder="Identity and onboarding checks completed" className="sm:col-span-2" required /><Button type="submit" disabled={pending} className="sm:col-span-2">Verify and activate</Button></form> : null}
      {currentRole === "super_admin" && member.role === "admin" && member.status !== "revoked" ? <form onSubmit={(event) => onPermissions(event, member.userId)} className="mt-5 grid gap-4 rounded-2xl border border-navy/10 p-5"><p className="font-bold text-navy">Permissions</p><div className="grid gap-2 sm:grid-cols-2">{permissionCatalog.map((permission) => <label key={permission.permission_key} className="flex items-center gap-2 text-sm text-slate"><input type="checkbox" name="permissions" value={permission.permission_key} defaultChecked={member.permissions.includes(permission.permission_key)} />{title(permission.permission_key)}</label>)}</div><Field label="Reason for this permission set" name="reason" placeholder="Approved responsibilities for this administrator" required /><Button type="submit" variant="secondary" disabled={pending}>Save permissions</Button></form> : null}
    </article>)}{!members.length ? <p className="rounded-3xl bg-white p-6 text-sm text-slate">No {groupTitle.toLowerCase()} have been added.</p> : null}</div></section>;
}
