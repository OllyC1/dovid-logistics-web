"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Field, TextareaField } from "@/components/ui/field";

export function InquiryForm({ kind = "contact" }: { kind?: "contact" | "business" }) {
  const [state, setState] = useState({ pending: false, message: "", ok: false });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState({ pending: true, message: "", ok: false });
    const formElement = event.currentTarget;
    try {
      const response = await fetch("/api/inquiries", { method: "POST", body: new FormData(formElement) });
      const body = await response.json().catch(() => ({}));
      setState({ pending: false, message: body.message ?? body.error ?? "We could not send your message.", ok: response.ok });
      if (response.ok) formElement.reset();
    } catch {
      setState({ pending: false, message: "We could not send your message. Please call or message us on WhatsApp.", ok: false });
    }
  }

  return <form onSubmit={submit} className="grid gap-5">
    <input type="hidden" name="kind" value={kind} />
    <input className="hidden" tabIndex={-1} autoComplete="off" name="website" aria-hidden="true" />
    <div className="grid gap-5 sm:grid-cols-2">
      <Field name="name" label="Name" required autoComplete="name" />
      <Field name="email" type="email" label="Email" required autoComplete="email" />
    </div>
    {kind === "business" ? <Field name="company" label="Business name" required /> : null}
    <Field name="phone" type="tel" label="Phone number (optional)" autoComplete="tel" />
    <Field name="subject" label="Subject" required />
    <TextareaField name="message" label="How can we help?" required minLength={10} />
    {state.message ? <p role="status" className={`rounded-2xl p-4 text-sm ${state.ok ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900"}`}>{state.message}</p> : null}
    <Button type="submit" disabled={state.pending}>{state.pending ? "Sending…" : "Send enquiry"}</Button>
  </form>;
}
