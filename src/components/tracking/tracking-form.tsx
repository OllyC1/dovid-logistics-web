"use client";

import type { FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";

export function TrackingForm() {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = String(new FormData(event.currentTarget).get("reference") ?? "").trim().toUpperCase();
    if (!normalized) return;
    window.open(`/track/${encodeURIComponent(normalized)}`, "_self");
  }

  return <form className="mt-8 grid gap-4" action="/track/result" method="get" onSubmit={submit}><Field name="reference" label="Tracking reference" placeholder="DOV-…" required/><Button type="submit">Check delivery status</Button></form>;
}
