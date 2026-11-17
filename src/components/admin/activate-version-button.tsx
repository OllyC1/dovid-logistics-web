"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ReasonDialog } from "@/components/ui/reason-dialog";

export function ActivateVersionButton({ id }: { id: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<{ text: string; ok: boolean } | null>(null);

  async function activate(reason: string) {
    setPending(true);
    setFeedback(null);
    const response = await fetch(`/api/admin/pricing/config/${id}/activate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),
    });
    const body = await response.json().catch(() => ({}));
    setPending(false);
    if (!response.ok) {
      setFeedback({ text: body.error ?? "The pricing version could not be activated.", ok: false });
      return;
    }
    setOpen(false);
    setFeedback({ text: "Pricing version activated and recorded in the audit history.", ok: true });
    router.refresh();
  }

  return <div className="grid gap-2">
    <Button type="button" variant="outline" disabled={pending} onClick={() => setOpen(true)}>{pending ? "Activating…" : "Activate"}</Button>
    {feedback ? <p role={feedback.ok ? "status" : "alert"} className={`rounded-xl p-3 text-sm ${feedback.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"}`}>{feedback.text}</p> : null}
    <ReasonDialog
      open={open}
      title="Activate this pricing version?"
      description="Activation changes the pricing configuration used for new quotes. Record the approval reason before continuing."
      confirmLabel="Activate version"
      pending={pending}
      onCancel={() => setOpen(false)}
      onConfirm={activate}
    />
  </div>;
}
