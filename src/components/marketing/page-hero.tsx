import { Button } from "@/components/ui/button";

export function PageHero({ eyebrow, title, copy, action = "Book a delivery" }: { eyebrow: string; title: string; copy: string; action?: string }) {
  return <section className="relative overflow-hidden bg-navy py-20 text-white md:py-28"><div className="route-grid absolute inset-0 opacity-25" /><div className="container relative"><p className="eyebrow text-orange-light">{eyebrow}</p><h1 className="mt-4 max-w-4xl text-balance text-4xl font-extrabold tracking-tight md:text-6xl">{title}</h1><p className="mt-6 max-w-2xl text-lg leading-8 text-white/70">{copy}</p><div className="mt-8"><Button href="/book">{action}</Button></div></div></section>;
}
