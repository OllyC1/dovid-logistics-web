import { FaqList } from "@/components/marketing/faq-list";
import { PageHero } from "@/components/marketing/page-hero";
import { createMetadata } from "@/lib/seo";

export const metadata = createMetadata("Delivery FAQs", "Answers about Dovid booking, pricing, payments, package tracking and support.", "/faq");

export default function FaqPage() {
  return <><PageHero eyebrow="Help centre" title="Questions? Start here." copy="Find quick answers about booking, pricing, payment and tracking." action="Book a delivery" /><section className="py-20"><div className="container max-w-3xl"><FaqList /></div></section></>;
}
