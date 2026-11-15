import type { Metadata } from "next";
import { BookingWizard } from "@/components/booking/booking-wizard";
export const metadata: Metadata = { title: "Book a delivery", description: "Create a Dovid delivery request.", robots: { index: false, follow: false } };
export default function BookPage(){return <section className="container py-14 md:py-20"><p className="eyebrow">New delivery</p><h1 className="mt-3 text-4xl font-extrabold text-navy md:text-5xl">Where should we go?</h1><p className="mt-4 max-w-2xl text-slate">Choose the pickup and delivery addresses, tell us about your parcel and see your price before you confirm.</p><div className="mt-10"><BookingWizard /></div></section>}
