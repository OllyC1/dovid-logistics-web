"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function ActivateRateCardButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<{ text: string; ok: boolean } | null>(null);

  async function activate() {
    setPending(true);
    setFeedback(null);
    const response = await fetch(`/api/admin/pricing/rate-cards/${id}/activate`, { method: "POST" });
    const body = await response.json().catch(() => ({}));
    setPending(false);
    if (!response.ok) {
      setFeedback({ text: body.error ?? "The rate card could not be activated.", ok: false });
      return;
    }
    setFeedback({ text: "Rate card activated for future quotes.", ok: true });
    router.refresh();
  }

  return <div className="grid gap-2">
    <Button type="button" variant="outline" disabled={pending} onClick={activate}>{pending ? "Activating…" : "Activate"}</Button>
    {feedback ? <p role={feedback.ok ? "status" : "alert"} className={`rounded-xl p-3 text-sm ${feedback.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"}`}>{feedback.text}</p> : null}
  </div>;
}
