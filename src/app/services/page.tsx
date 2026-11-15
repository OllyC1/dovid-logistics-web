import { Bike, Boxes, Building2, Clock3, PackageOpen, Route } from "lucide-react";
import { PageHero } from "@/components/marketing/page-hero";
import { SectionHeading } from "@/components/marketing/section-heading";
import { createMetadata } from "@/lib/seo";

export const metadata = createMetadata("Logistics and delivery services in Ibadan", "Explore Dovid motorcycle dispatch, parcel, last-mile and business delivery services.", "/services");

const items = [
  [Bike, "dispatch", "Motorcycle delivery", "A quick, practical choice for documents and smaller parcels around Ibadan."],
  [PackageOpen, "parcel", "Parcel delivery", "Easy booking and clear tracking for everyday deliveries."],
  [Route, "last-mile", "Last-mile delivery", "Doorstep delivery for online sellers and merchants who want a dependable customer experience."],
  [Building2, "business", "Business delivery", "Flexible support for regular orders and growing delivery volumes."],
  [Clock3, "scheduled", "Scheduled pickup", "Choose a future collection time when you do not need the parcel sent straight away."],
  [Boxes, "handling", "Care for every parcel", "Tell us what you are sending so we can confirm the right delivery option."]
] as const;

export default function ServicesPage() {
  return <><PageHero eyebrow="Delivery services" title="The right delivery for every kind of day." copy="From one small parcel to regular business orders, Dovid helps you send with confidence." /><section className="bg-white py-20 md:py-28"><div className="container"><SectionHeading eyebrow="How we can help" title="Flexible delivery. One simple experience." /><div className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-3">{items.map(([Icon, id, title, copy]) => <article id={id} key={id} className="scroll-mt-28 rounded-3xl border border-navy/10 p-7"><div className="grid size-12 place-items-center rounded-2xl bg-orange/10 text-orange"><Icon /></div><h2 className="mt-6 text-2xl font-extrabold text-navy">{title}</h2><p className="mt-3 leading-7 text-slate">{copy}</p></article>)}</div></div></section></>;
}
