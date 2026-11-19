"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function ApplicationError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <section className="mx-auto grid min-h-[55vh] w-full max-w-2xl content-center gap-6 px-4 py-12 text-center sm:px-6">
      <div className="mx-auto grid size-14 place-items-center rounded-full bg-orange/10 text-2xl font-black text-orange" aria-hidden="true">!</div>
      <div className="grid gap-3">
        <h1 className="text-3xl font-extrabold text-navy">That page did not finish loading</h1>
        <p className="text-base leading-7 text-slate">
          Your information is safe. Try the page again, or return home if the problem continues.
        </p>
      </div>
      <div className="grid gap-3 sm:flex sm:justify-center">
        <Button type="button" onClick={retry} className="w-full sm:w-auto">Try again</Button>
        <Link href="/" className="inline-flex min-h-12 w-full items-center justify-center rounded-full border border-navy/15 px-6 font-bold text-navy transition hover:border-navy sm:w-auto">
          Return home
        </Link>
      </div>
    </section>
  );
}
