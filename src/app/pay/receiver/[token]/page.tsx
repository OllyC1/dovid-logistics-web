import type { Metadata } from "next";
import { ReceiverPaymentForm } from "@/components/payments/receiver-payment-form";
export const metadata:Metadata={title:"Receiver payment",robots:{index:false,follow:false}};
export default async function ReceiverPayPage({params}:{params:Promise<{token:string}>}){const {token}=await params;return <section className="container grid min-h-[65vh] place-items-center py-16"><div className="w-full max-w-lg rounded-[2rem] bg-white p-8 shadow-sm"><p className="eyebrow">Receiver payment</p><h1 className="mt-3 text-3xl font-extrabold text-navy">Pay for this delivery</h1><p className="mt-4 leading-7 text-slate">Enter your email to continue to Dovid checkout. We will send your receipt there too.</p><ReceiverPaymentForm token={token}/></div></section>}
