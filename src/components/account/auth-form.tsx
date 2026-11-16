"use client";
import { useActionState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Field, PasswordField } from "@/components/ui/field";
import { loginAction, recoverAction, registerAction, type AuthState } from "@/features/auth/actions";

export function AuthForm({ mode }: { mode: "login" | "register" | "recover" }) {
  const action = mode === "login" ? loginAction : mode === "register" ? registerAction : recoverAction;
  const [state, formAction, pending] = useActionState<AuthState, FormData>(action, {});
  return <form action={formAction} className="grid gap-5">{mode === "register" ? <><Field label="Full name" name="fullName" autoComplete="name" required /><Field label="Phone number" name="phone" autoComplete="tel" required /></> : null}<Field label="Email address" name="email" type="email" autoComplete="email" required />{mode !== "recover" ? <PasswordField label="Password" name="password" autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={8} required /> : null}{state.error ? <p role="alert" className="rounded-2xl bg-red-50 p-4 text-sm text-red-800">{state.error}</p> : null}{state.success ? <p role="status" className="rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-800">{state.success}</p> : null}<Button type="submit" disabled={pending}>{pending ? "Please wait…" : mode === "login" ? "Log in" : mode === "register" ? "Create account" : "Send recovery link"}</Button>{mode === "login" ? <div className="flex justify-between text-sm"><Link className="font-semibold text-orange" href="/forgot-password">Forgot password?</Link><Link className="font-semibold text-orange" href="/register">Create account</Link></div> : null}</form>;
}
