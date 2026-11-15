import { AuthForm } from "@/components/account/auth-form";
export default function LoginPage(){return <><p className="eyebrow">Welcome back</p><h1 className="mt-3 text-3xl font-extrabold text-navy">Log in to your account</h1><p className="mt-3 text-sm leading-6 text-slate">View deliveries, payments, saved addresses and tracking updates.</p><div className="mt-8"><AuthForm mode="login" /></div></>}
