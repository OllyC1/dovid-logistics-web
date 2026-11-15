import type { Metadata } from "next";
import { TrackingForm } from "@/components/tracking/tracking-form";
export const metadata:Metadata={title:"Track a delivery",description:"Track a Dovid delivery using its secure reference.",robots:{index:false,follow:false}};
export default function TrackPage(){return <section className="container grid min-h-[65vh] place-items-center py-16"><div className="w-full max-w-xl rounded-[2rem] bg-white p-8 shadow-sm"><p className="eyebrow">Track a delivery</p><h1 className="mt-3 text-4xl font-extrabold text-navy">See where your parcel is.</h1><p className="mt-4 leading-7 text-slate">Enter the tracking reference from your booking confirmation.</p><TrackingForm/></div></section>}
