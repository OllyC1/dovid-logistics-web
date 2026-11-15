import { MapPin, Route, ShieldCheck } from "lucide-react";
import { PageHero } from "@/components/marketing/page-hero";
import { createMetadata } from "@/lib/seo";

export const metadata = createMetadata("Logistics and delivery services in Ibadan", "Check Dovid parcel and motorcycle delivery availability in Ibadan, Oyo State.", "/locations/ibadan");

export default function IbadanPage() {
  return <><PageHero eyebrow="Where we deliver" title="Dovid delivery in Ibadan." copy="Enter your pickup and delivery addresses when booking and we will confirm whether we can make the journey." /><section className="bg-white py-20"><div className="container grid gap-5 md:grid-cols-3">{[[MapPin, "Check both addresses", "We confirm the pickup and delivery locations before showing your price."], [Route, "Price for your journey", "Your price reflects the distance, parcel and delivery option you choose."], [ShieldCheck, "Easy to follow", "Track the parcel from collection until it reaches the receiver."]].map(([Icon, title, copy]) => { const ItemIcon = Icon as typeof MapPin; return <article key={String(title)} className="rounded-3xl border border-navy/10 p-7"><ItemIcon className="size-8 text-orange"/><h2 className="mt-5 text-xl font-extrabold text-navy">{String(title)}</h2><p className="mt-3 leading-7 text-slate">{String(copy)}</p></article>; })}</div></section></>;
}
