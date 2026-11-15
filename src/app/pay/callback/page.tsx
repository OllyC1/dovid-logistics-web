import type { Metadata } from "next";
import { PaymentStatus } from "@/components/payments/payment-status";

export const metadata: Metadata = { title: "Payment status", robots: { index: false, follow: false } };

export default async function PaymentCallback({ searchParams }: { searchParams: Promise<{ reference?: string; trxref?: string }> }) {
  const params = await searchParams;
  const reference = params.reference ?? params.trxref ?? "";
  return <section className="container grid min-h-[60vh] place-items-center py-16"><div className="max-w-lg rounded-[2rem] bg-white p-8 text-center shadow-sm"><p className="eyebrow">Payment status</p><h1 className="mt-3 text-3xl font-extrabold text-navy">We’re confirming your payment.</h1>{reference ? <PaymentStatus reference={reference}/> : <p role="alert" className="mt-4 rounded-2xl bg-amber-50 p-4 leading-7 text-amber-900">This payment return link is missing its reference. Check your delivery page before trying again.</p>}</div></section>;
}
