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
  return <div className="grid gap-3">{faqItems.slice(0, limit).map(([question, answer]) => <details key={question} className="group rounded-2xl border border-navy/10 bg-white px-5"><summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-5 py-4 text-left font-bold text-navy marker:content-none"><span>{question}</span><ChevronDown className="size-5 shrink-0 transition group-open:rotate-180" aria-hidden="true" /></summary><p className="pb-5 text-sm leading-7 text-slate">{answer}</p></details>)}</div>;
}
