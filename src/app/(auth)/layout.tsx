import type { Metadata } from "next";
export const metadata: Metadata = { robots: { index: false, follow: false } };
export default function AuthLayout({ children }: { children: React.ReactNode }) { return <section className="container grid min-h-[70vh] place-items-center py-16"><div className="w-full max-w-md rounded-[2rem] border border-navy/10 bg-white p-7 shadow-xl md:p-9">{children}</div></section>; }
