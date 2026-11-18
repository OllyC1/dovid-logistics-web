"use client";
import { useActionState } from "react";
import { LoaderCircle } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Field, PasswordField } from "@/components/ui/field";
import { loginAction, recoverAction, registerAction, type AuthState } from "@/features/auth/actions";
import { NEW_PASSWORD_HINT, NEW_PASSWORD_MAX_LENGTH, NEW_PASSWORD_MIN_LENGTH } from "@/lib/auth/password-policy";

export function AuthForm({ mode }: { mode: "login" | "register" | "recover" }) {
  const action = mode === "login" ? loginAction : mode === "register" ? registerAction : recoverAction;
  const [state, formAction, pending] = useActionState<AuthState, FormData>(action, {});
  const pendingLabel = mode === "login" ? "Checking your details…" : mode === "register" ? "Creating your account…" : "Sending recovery link…";
  return <form action={formAction} className="grid gap-5" aria-busy={pending}>{mode === "register" ? <><Field label="Full name" name="fullName" autoComplete="name" required /><Field label="Phone number" name="phone" autoComplete="tel" required /></> : null}<Field label="Email address" name="email" type="email" autoComplete="email" required />{mode !== "recover" ? <PasswordField label="Password" name="password" autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={mode === "register" ? NEW_PASSWORD_MIN_LENGTH : 8} maxLength={mode === "register" ? NEW_PASSWORD_MAX_LENGTH : undefined} hint={mode === "register" ? NEW_PASSWORD_HINT : undefined} required /> : null}{state.error ? <p role="alert" className="rounded-2xl bg-red-50 p-4 text-sm text-red-800">{state.error}</p> : null}{state.success ? <p role="status" className="rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-800">{state.success}</p> : null}<Button className="gap-2" type="submit" disabled={pending} aria-busy={pending}>{pending ? <><LoaderCircle className="size-4 animate-spin" aria-hidden="true" />{pendingLabel}</> : mode === "login" ? "Log in" : mode === "register" ? "Create account" : "Send recovery link"}</Button>{mode === "login" ? <div className="grid gap-3 text-sm sm:flex sm:justify-between"><Link className="min-h-11 rounded-xl px-1 py-3 font-semibold text-orange" href="/forgot-password">Forgot password?</Link><Link className="min-h-11 rounded-xl px-1 py-3 font-semibold text-orange" href="/register">Create account</Link></div> : null}</form>;
}
