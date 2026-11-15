import { cn } from "@/lib/utils";

export function SectionHeading({ eyebrow, title, copy, align = "left" }: { eyebrow: string; title: string; copy?: string; align?: "left" | "center" }) {
  return <div className={cn("max-w-2xl", align === "center" && "mx-auto text-center")}><p className="eyebrow">{eyebrow}</p><h2 className="mt-3 text-balance text-3xl font-extrabold tracking-tight text-navy md:text-5xl">{title}</h2>{copy ? <p className="mt-5 text-pretty text-base leading-7 text-slate md:text-lg">{copy}</p> : null}</div>;
}
