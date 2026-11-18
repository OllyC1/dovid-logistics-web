"use client";

import { useEffect, useState } from "react";
import { ActionFeedback } from "@/components/ui/action-feedback";

type SignOutStatus = "success" | "error" | null;

export function SignedOutNotice({ initialStatus = null }: { initialStatus?: SignOutStatus }) {
  const [status, setStatus] = useState<SignOutStatus>(initialStatus);

  useEffect(() => {
    const url = new URL(window.location.href);
    const queryStatus: SignOutStatus = url.searchParams.get("signedOut") === "1" ? "success" : url.searchParams.get("signOutError") === "1" ? "error" : null;
    const nextStatus = initialStatus ?? queryStatus;
    if (!nextStatus) return;
    url.searchParams.delete("signedOut");
    url.searchParams.delete("signOutError");
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
    const showNotice = window.setTimeout(() => setStatus(nextStatus), 0);
    const hideNotice = window.setTimeout(() => setStatus(null), 8_000);
    return () => {
      window.clearTimeout(showNotice);
      window.clearTimeout(hideNotice);
    };
  }, [initialStatus]);

  const feedback = status === "success"
    ? { text: "You’re signed out. See you again soon.", ok: true }
    : status === "error"
      ? { text: "We couldn’t confirm sign-out. Please try again before leaving this device.", ok: false }
      : null;
  return <ActionFeedback feedback={feedback} onDismiss={() => setStatus(null)} />;
}
