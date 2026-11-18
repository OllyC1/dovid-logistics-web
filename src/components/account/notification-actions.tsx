"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { markAllNotificationsReadAction } from "@/features/account/actions";

export function MarkNotificationsReadButton({ unreadCount }: { unreadCount: number }) {
  const [state, action, pending] = useActionState(markAllNotificationsReadAction, {});
  if (unreadCount === 0 && !state.success && !state.error) return null;

  return <div className="grid gap-3">
    {unreadCount > 0 ? <form action={action}>
      <input type="hidden" name="acknowledgement" value="read" />
      <Button type="submit" className="w-full sm:w-auto" variant="outline" disabled={pending}>{pending ? "Updating…" : `Mark all ${unreadCount} as read`}</Button>
    </form> : null}
    {state.success ? <p role="status" className="rounded-2xl bg-emerald-50 p-4 text-sm font-semibold text-emerald-900">{state.success}</p> : null}
    {state.error ? <p role="alert" className="rounded-2xl bg-red-50 p-4 text-sm font-semibold text-red-900">{state.error}</p> : null}
  </div>;
}
