import type { InputHTMLAttributes, TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Field({ label, error, className, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string }) {
  return <label className="grid gap-2 text-sm font-semibold text-navy"><span>{label}</span><input className={cn("min-h-12 rounded-2xl border border-slate/25 bg-white px-4 text-base font-normal outline-none transition placeholder:text-slate/60 focus:border-orange focus:ring-4 focus:ring-orange/10", className)} aria-invalid={Boolean(error)} {...props} />{error ? <span className="text-xs font-medium text-red-700" role="alert">{error}</span> : null}</label>;
}

export function TextareaField({ label, error, className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; error?: string }) {
  return <label className="grid gap-2 text-sm font-semibold text-navy"><span>{label}</span><textarea className={cn("min-h-32 rounded-2xl border border-slate/25 bg-white px-4 py-3 text-base font-normal outline-none transition placeholder:text-slate/60 focus:border-orange focus:ring-4 focus:ring-orange/10", className)} aria-invalid={Boolean(error)} {...props} />{error ? <span className="text-xs font-medium text-red-700" role="alert">{error}</span> : null}</label>;
}
