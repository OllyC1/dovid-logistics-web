import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Page not found",
  description: "The requested Dovid Logistics page could not be found.",
};

export default function NotFound() {
  return (
    <section className="mx-auto grid min-h-[55vh] w-full max-w-2xl content-center gap-6 px-4 py-12 text-center sm:px-6">
      <p className="text-sm font-extrabold uppercase tracking-[0.18em] text-orange">Page not found</p>
      <div className="grid gap-3">
        <h1 className="text-3xl font-extrabold text-navy sm:text-4xl">We cannot find that page</h1>
        <p className="text-base leading-7 text-slate">
          The link may be old or incomplete. You can return home, book a delivery, or track an existing one.
        </p>
      </div>
      <nav aria-label="Page not found options" className="grid gap-3 sm:flex sm:flex-wrap sm:justify-center">
        <Link href="/" className="inline-flex min-h-12 items-center justify-center rounded-full bg-orange px-6 font-bold text-white">Return home</Link>
        <Link href="/book" className="inline-flex min-h-12 items-center justify-center rounded-full border border-navy/15 px-6 font-bold text-navy">Book a delivery</Link>
        <Link href="/track" className="inline-flex min-h-12 items-center justify-center rounded-full border border-navy/15 px-6 font-bold text-navy">Track a delivery</Link>
      </nav>
    </section>
  );
}
