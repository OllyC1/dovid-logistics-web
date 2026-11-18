"use client";

import { useEffect, useId, useState } from "react";
import { CheckCircle2, Loader2, X, XCircle } from "lucide-react";

type Feedback = { text: string; ok: boolean } | null;
const actionFeedbackEvent = "dovid:action-feedback";

export function ActionFeedback({ feedback, pending, pendingText = "Saving your change…", onDismiss }: { feedback: Feedback; pending?: boolean; pendingText?: string; onDismiss?: () => void }) {
  const instanceId = useId();
  const ok = feedback?.ok ?? true;
  const text = pending ? pendingText : feedback?.text;
  const activationKey = pending ? `pending:${pendingText}` : feedback ? `${feedback.ok ? "ok" : "error"}:${feedback.text}` : "";
  const [hiddenActivationKey, setHiddenActivationKey] = useState("");

  useEffect(() => {
    function hideWhenAnotherMessageOpens(event: Event) {
      const sourceId = (event as CustomEvent<{ sourceId: string }>).detail?.sourceId;
      if (!sourceId) return;
      setHiddenActivationKey(sourceId === instanceId ? "" : activationKey);
    }
    window.addEventListener(actionFeedbackEvent, hideWhenAnotherMessageOpens);
    return () => window.removeEventListener(actionFeedbackEvent, hideWhenAnotherMessageOpens);
  }, [activationKey, instanceId]);

  useEffect(() => {
    if (!activationKey) return;
    window.dispatchEvent(new CustomEvent(actionFeedbackEvent, { detail: { sourceId: instanceId } }));
  }, [activationKey, instanceId]);

  if (!activationKey || hiddenActivationKey === activationKey) return null;

  return (
    <div className="pointer-events-none fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+0.75rem)] z-[130] mx-auto flex max-w-xl items-start gap-3 rounded-2xl border border-white/60 bg-white p-4 text-sm shadow-2xl sm:inset-x-auto sm:right-5 sm:bottom-5 sm:w-[min(28rem,calc(100vw-2.5rem))]" role={pending || ok ? "status" : "alert"} aria-live={pending || ok ? "polite" : "assertive"} aria-atomic="true">
      {pending ? <Loader2 className="mt-0.5 size-5 shrink-0 animate-spin text-orange" aria-hidden /> : ok ? <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-600" aria-hidden /> : <XCircle className="mt-0.5 size-5 shrink-0 text-red-600" aria-hidden />}
      <p className={`min-w-0 flex-1 break-words font-semibold leading-6 ${pending ? "text-navy" : ok ? "text-emerald-900" : "text-red-900"}`}>{text}</p>
      {!pending && onDismiss ? <button type="button" onClick={onDismiss} className="pointer-events-auto inline-flex size-11 shrink-0 items-center justify-center rounded-full text-slate hover:bg-cloud focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange" aria-label="Dismiss message"><X className="size-5" aria-hidden /></button> : null}
    </div>
  );
}
