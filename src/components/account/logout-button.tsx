"use client";

import { LoaderCircle, LogOut } from "lucide-react";
import { useFormStatus } from "react-dom";
import { ActionFeedback } from "@/components/ui/action-feedback";

export function LogoutButton() {
  const { pending } = useFormStatus();
  return <>
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className="inline-flex min-h-12 w-full touch-manipulation items-center justify-center gap-2 rounded-xl px-3 py-3 text-sm font-bold text-orange transition active:scale-[0.98] active:bg-white/10 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange disabled:cursor-wait disabled:opacity-80 disabled:active:scale-100"
    >
      {pending ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <LogOut className="size-4" aria-hidden />}
      {pending ? "Signing out…" : "Log out"}
    </button>
    <ActionFeedback feedback={null} pending={pending} pendingText="Signing you out securely…" />
  </>;
}
