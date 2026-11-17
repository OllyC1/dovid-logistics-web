"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ReasonDialog } from "@/components/ui/reason-dialog";

export function RateCardActions({ id, active }: { id: string; active: boolean }) {
  const router = useRouter();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");

  async function remove(reason: string) {
    setPending(true);
    setMessage("");
    const response = await fetch(`/api/admin/pricing/rate-cards/${id}`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason }) });
    const body = await response.json().catch(() => ({}));
    setPending(false);
    setConfirmDelete(false);
    setMessage(response.ok ? "Unused draft deleted." : body.error ?? "The draft could not be deleted.");
    if (response.ok) router.refresh();
  }

  return <div className="grid gap-2 sm:flex sm:flex-wrap sm:items-center"><a href={`?edit=${id}#rate-card-editor`} className="inline-flex min-h-11 items-center justify-center rounded-full border border-navy/15 px-4 text-sm font-bold text-navy">Edit as a new version</a>{!active ? <Button type="button" variant="ghost" disabled={pending} onClick={() => setConfirmDelete(true)}>Delete unused draft</Button> : null}{message ? <p role="status" className="w-full text-sm text-slate">{message}</p> : null}<ReasonDialog open={confirmDelete} title="Delete this unused rate-card draft?" description="Only an inactive card with no quote history can be deleted. Historic and active pricing stays immutable." confirmLabel="Delete draft" pending={pending} onCancel={() => setConfirmDelete(false)} onConfirm={remove}/></div>;
}
