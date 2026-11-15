import { PageHero } from "@/components/marketing/page-hero";
import { SectionHeading } from "@/components/marketing/section-heading";
import { createMetadata } from "@/lib/seo";

export const metadata = createMetadata("About Dovid Logistics", "Learn about Dovid Logistics and our mission to make delivery more trustworthy and effortless.", "/about");

export default function AboutPage() {
  return <><PageHero eyebrow="About Dovid" title="Delivery should feel simple." copy="Dovid Logistics helps people and businesses send parcels with clear prices, useful updates and support when they need it." /><section className="bg-white py-20 md:py-28"><div className="container grid gap-12 lg:grid-cols-2"><SectionHeading eyebrow="Our mission" title="Deliver trust with every journey." copy="We believe sending a parcel should be easy to arrange, easy to understand and easy to follow from pickup to arrival." /><div className="grid gap-4 sm:grid-cols-2">{[["Trust", "We handle every delivery with care and keep you informed."], ["Momentum", "We remove unnecessary steps so you can keep moving."], ["Clarity", "Prices, progress and next steps are easy to understand."], ["Growth", "We are starting in Ibadan and expanding responsibly."]].map(([title, copy]) => <article key={title} className="rounded-3xl bg-cloud p-6"><h2 className="text-xl font-extrabold text-navy">{title}</h2><p className="mt-3 text-sm leading-7 text-slate">{copy}</p></article>)}</div></div></section></>;
}
