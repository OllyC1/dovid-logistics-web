"use client";

import type { InputHTMLAttributes, TextareaHTMLAttributes } from "react";
import { useId, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";

export function Field({ label, error, className, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string }) {
  return <label className="grid gap-2 text-sm font-semibold text-navy"><span>{label}</span><input className={cn("min-h-12 rounded-2xl border border-slate/25 bg-white px-4 text-base font-normal outline-none transition placeholder:text-slate/60 focus:border-orange focus:ring-4 focus:ring-orange/10", className)} aria-invalid={Boolean(error)} {...props} />{error ? <span className="text-xs font-medium text-red-700" role="alert">{error}</span> : null}</label>;
}

export function TextareaField({ label, error, className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; error?: string }) {
  return <label className="grid gap-2 text-sm font-semibold text-navy"><span>{label}</span><textarea className={cn("min-h-32 rounded-2xl border border-slate/25 bg-white px-4 py-3 text-base font-normal outline-none transition placeholder:text-slate/60 focus:border-orange focus:ring-4 focus:ring-orange/10", className)} aria-invalid={Boolean(error)} {...props} />{error ? <span className="text-xs font-medium text-red-700" role="alert">{error}</span> : null}</label>;
}

export function PasswordField({ label, error, hint, className, id, "aria-describedby": describedBy, ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & { label: string; error?: string; hint?: string }) {
  const [visible, setVisible] = useState(false);
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const hintId = hint ? `${inputId}-hint` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;
  const descriptionIds = [describedBy, hintId, errorId].filter(Boolean).join(" ") || undefined;
  return <div className="grid gap-2 text-sm font-semibold text-navy"><label htmlFor={inputId}>{label}</label><span className="relative"><input id={inputId} className={cn("min-h-12 w-full rounded-2xl border border-slate/25 bg-white px-4 pr-12 text-base font-normal outline-none transition placeholder:text-slate/60 focus:border-orange focus:ring-4 focus:ring-orange/10", className)} type={visible ? "text" : "password"} aria-invalid={Boolean(error)} aria-describedby={descriptionIds} {...props} /><button type="button" className="absolute inset-y-0 right-1 grid min-w-11 place-items-center rounded-xl text-slate transition hover:text-navy focus-visible:outline-2 focus-visible:outline-orange" aria-label={visible ? "Hide password" : "Show password"} aria-pressed={visible} onClick={() => setVisible((current) => !current)}>{visible ? <EyeOff className="size-5" aria-hidden="true" /> : <Eye className="size-5" aria-hidden="true" />}</button></span>{hint ? <span id={hintId} className="text-xs font-normal leading-5 text-slate">{hint}</span> : null}{error ? <span id={errorId} className="text-xs font-medium text-red-700" role="alert">{error}</span> : null}</div>;
}
