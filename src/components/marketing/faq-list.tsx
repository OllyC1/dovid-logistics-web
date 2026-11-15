"use client";

import * as Accordion from "@radix-ui/react-accordion";
import { ChevronDown } from "lucide-react";

export const faqItems = [
  ["Where does Dovid currently deliver?", "We are starting in selected parts of Ibadan. Enter the pickup and delivery addresses when booking and we will confirm availability straight away."],
  ["How can I pay?", "You can pay online or by transfer to the Dovid company account. The sender can pay, or you can send the receiver a payment request."],
  ["How do I track a delivery?", "Enter the tracking reference from your booking confirmation, or sign in to see all your deliveries."],
  ["What happens if the receiver is paying?", "We send the receiver a payment link. If they choose to pay when the parcel arrives, the rider hands it over after Dovid confirms the payment."],
  ["Can I send any item?", "Some items cannot be carried, and size, weight and value limits may apply. Tell us what you are sending during booking and we will guide you."],
  ["How is the delivery price calculated?", "Your price depends on the journey, parcel size and delivery speed. You will see the full amount before you confirm."]
] as const;

export function FaqList({ limit }: { limit?: number }) {
  return <Accordion.Root type="single" collapsible className="grid gap-3">{faqItems.slice(0, limit).map(([question, answer], index) => <Accordion.Item key={question} value={`item-${index}`} className="rounded-2xl border border-navy/10 bg-white px-5"><Accordion.Header><Accordion.Trigger className="group flex w-full items-center justify-between gap-5 py-5 text-left font-bold text-navy"><span>{question}</span><ChevronDown className="size-5 shrink-0 transition group-data-[state=open]:rotate-180" /></Accordion.Trigger></Accordion.Header><Accordion.Content className="overflow-hidden text-sm leading-7 text-slate"><p className="pb-5">{answer}</p></Accordion.Content></Accordion.Item>)}</Accordion.Root>;
}
