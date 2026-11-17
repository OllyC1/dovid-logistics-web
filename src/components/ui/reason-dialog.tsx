"use client";

import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Button } from "@/components/ui/button";

export function ReasonDialog({
  open,
  title,
  description,
  confirmLabel,
  pending,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  pending: boolean;
  onCancel: () => void;
  onConfirm: (reason: string) => void | Promise<void>;
}) {
  const [reason, setReason] = useState("");

  function close() {
    if (pending) return;
    setReason("");
    onCancel();
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = reason.trim();
    if (normalized.length < 8) return;
    await onConfirm(normalized);
    setReason("");
  }

  return <Dialog.Root open={open} onOpenChange={(nextOpen) => { if (!nextOpen) close(); }}>
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-50 bg-navy/70 backdrop-blur-sm" />
      <Dialog.Content className="fixed inset-x-4 top-1/2 z-50 max-h-[calc(100dvh-2rem)] -translate-y-1/2 overflow-y-auto rounded-3xl bg-white p-5 shadow-2xl sm:left-1/2 sm:right-auto sm:w-full sm:max-w-lg sm:-translate-x-1/2 sm:p-7">
        <Dialog.Title className="text-xl font-extrabold text-navy sm:text-2xl">{title}</Dialog.Title>
        <Dialog.Description className="mt-2 text-sm leading-6 text-slate">{description}</Dialog.Description>
        <form className="mt-5 grid gap-4" onSubmit={submit}>
          <label className="grid gap-2 text-sm font-bold text-navy">
            Operational reason
            <textarea
              autoFocus
              required
              minLength={8}
              maxLength={500}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              className="min-h-28 w-full resize-y rounded-2xl border border-slate/30 p-4 font-normal text-navy outline-none focus:border-orange focus:ring-2 focus:ring-orange/20"
              placeholder="Record the verified reason for this action"
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <Button type="button" variant="outline" disabled={pending} onClick={close}>Cancel</Button>
            <Button type="submit" disabled={pending || reason.trim().length < 8}>{pending ? "Saving…" : confirmLabel}</Button>
          </div>
        </form>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
