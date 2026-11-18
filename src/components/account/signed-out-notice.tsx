"use client";

import { useEffect, useState } from "react";
import { ActionFeedback } from "@/components/ui/action-feedback";

export function SignedOutNotice() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("signedOut") !== "1") return;
    url.searchParams.delete("signedOut");
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
    const showNotice = window.setTimeout(() => setVisible(true), 0);
    const hideNotice = window.setTimeout(() => setVisible(false), 6_000);
    return () => {
      window.clearTimeout(showNotice);
      window.clearTimeout(hideNotice);
    };
  }, []);

  return <ActionFeedback feedback={visible ? { text: "You’re signed out. See you again soon.", ok: true } : null} onDismiss={() => setVisible(false)} />;
}
