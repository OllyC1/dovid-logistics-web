import { InquiryForm } from "@/components/marketing/inquiry-form";
import { PageHero } from "@/components/marketing/page-hero";
import { createMetadata } from "@/lib/seo";
export const metadata = createMetadata("Contact and delivery support", "Contact Dovid Logistics about a booking, delivery or business enquiry.", "/contact");
export default function ContactPage(){return <><PageHero eyebrow="Help & contact" title="Tell us what you need help with." copy="Send a support request and the team can respond through the contact details you provide." /><section className="container grid gap-12 py-20 lg:grid-cols-[.7fr_1.3fr]"><div><h2 className="text-3xl font-extrabold text-navy">Support that keeps things moving.</h2><p className="mt-4 leading-8 text-slate">For an existing delivery, include the order reference but never include card details, passwords or one-time codes.</p></div><div className="rounded-[2rem] bg-white p-7 shadow-sm"><InquiryForm /></div></section></>}
