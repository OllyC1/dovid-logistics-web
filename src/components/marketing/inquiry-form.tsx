"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, TextareaField } from "@/components/ui/field";

export function InquiryForm({ kind = "contact" }: { kind?: "contact" | "business" }) {
  const [state, setState] = useState({ pending: false, message: "", ok: false });
  async function submit(event: React.FormEvent<HTMLFormElement>) { event.preventDefault(); setState({ pending: true, message: "", ok: false }); const form = new FormData(event.currentTarget); const response = await fetch("/api/inquiries", { method: "POST", body: form }); const body = await response.json(); setState({ pending: false, message: body.message ?? body.error, ok: response.ok }); if (response.ok) event.currentTarget.reset(); }
  return <form onSubmit={submit} className="grid gap-5"><input type="hidden" name="kind" value={kind} /><input className="hidden" tabIndex={-1} autoComplete="off" name="website" aria-hidden="true" /><div className="grid gap-5 sm:grid-cols-2"><Field name="name" label="Name" required /><Field name="email" type="email" label="Email" required /></div>{kind === "business" ? <><Field name="company" label="Business name" required /><Field name="phone" label="Phone number" /></> : null}<Field name="subject" label="Subject" required /><TextareaField name="message" label="How can we help?" required minLength={10} />{state.message ? <p role="status" className={`rounded-2xl p-4 text-sm ${state.ok ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900"}`}>{state.message}</p> : null}<Button type="submit" disabled={state.pending}>{state.pending ? "Sending…" : "Send enquiry"}</Button></form>;
}
