"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/utils";

type QuoteDetails = {
  pickupAddress: string;
  deliveryAddress: string;
  packageDescription: string;
  packageCategory: string;
  packageSize: string;
  amountMinor: number;
  currency: string;
  expiresAt: string;
};

export function AssistedQuoteReview({ token, verified, details }: { token: string; verified: boolean; details?: QuoteDetails }) {
  const router = useRouter();
  const acceptanceId = useRef("");
  const [isVerified, setVerified] = useState(verified);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);

  async function verify(form: FormData) {
    setPending(true);
    setMessage("");
    const response = await fetch(`/api/assisted/quotes/${token}/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ otp: form.get("otp") }),
    });
    const body = await response.json().catch(() => ({}));
    setPending(false);
    if (!response.ok) return setMessage(body.error ?? "We could not verify that code. Please check it and try again.");
    setVerified(true);
    router.refresh();
  }

  async function accept(form: FormData) {
    setPending(true);
    setMessage("");
    if (!acceptanceId.current) acceptanceId.current = crypto.randomUUID();
    const response = await fetch(`/api/assisted/quotes/${token}/accept`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        payer: form.get("payer"),
        termsAccepted: form.get("termsAccepted") === "on",
        termsVersion: "2026-11",
        idempotencyKey: acceptanceId.current,
      }),
    });
    const body = await response.json().catch(() => ({}));
    setPending(false);
    if (!response.ok) return setMessage(body.error ?? "We could not confirm this delivery. Please try again or ask the staff member helping you.");
    if (body.order?.receiver_payment_token) {
      sessionStorage.setItem(`dovid-receiver-token-${body.order.order_id}`, body.order.receiver_payment_token);
    }
    router.push(body.guestOrderUrl);
  }

  if (!isVerified || !details) {
    return (
      <form action={verify} className="mx-auto max-w-lg rounded-3xl bg-white p-5 shadow-sm sm:p-7">
        <p className="text-sm font-bold text-orange">Step 1 of 2</p>
        <h1 className="mt-2 text-3xl font-extrabold text-navy">Enter your 6-digit code</h1>
        <p className="mt-3 text-base leading-7 text-slate">
          Use the code sent with your delivery quote. You do not need an account or password.
        </p>
        <label className="mt-6 grid gap-2 text-sm font-bold text-navy">
          Verification code
          <input
            required
            name="otp"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            maxLength={6}
            className="min-h-14 rounded-2xl border border-slate/25 px-3 text-center text-2xl tracking-[0.3em] outline-none focus:border-orange focus:ring-4 focus:ring-orange/10"
          />
        </label>
        <Button className="mt-5 min-h-12 w-full" disabled={pending} type="submit">
          {pending ? "Checking code…" : "Continue to my quote"}
        </Button>
        {message ? <p role="alert" className="mt-4 rounded-2xl bg-red-50 p-4 text-sm leading-6 text-red-800">{message}</p> : null}
        <p className="mt-5 text-sm leading-6 text-slate">Having trouble? Ask the Dovid staff member helping with your booking to resend the code.</p>
      </form>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <p className="text-sm font-bold text-orange">Step 2 of 2</p>
      <h1 className="mt-2 text-3xl font-extrabold text-navy">Check and confirm your delivery</h1>
      <p className="mt-3 text-base leading-7 text-slate">No sign-in is needed. Check the details below before you continue.</p>

      <div className="mt-6 grid gap-4">
        <article className="rounded-3xl bg-white p-5 sm:p-6">
          <h2 className="font-extrabold text-navy">Pickup and delivery</h2>
          <div className="mt-4 grid gap-3 text-sm leading-6 text-slate">
            <div><p className="font-bold text-navy">Pickup</p><p>{details.pickupAddress}</p></div>
            <div aria-hidden="true" className="pl-2 text-xl text-orange">↓</div>
            <div><p className="font-bold text-navy">Delivery</p><p>{details.deliveryAddress}</p></div>
          </div>
        </article>
        <article className="rounded-3xl bg-white p-5 sm:p-6">
          <h2 className="font-extrabold text-navy">Package and price</h2>
          <p className="mt-3 text-sm capitalize text-slate">{details.packageCategory} · {details.packageSize}</p>
          <p className="mt-1 text-sm leading-6 text-slate">{details.packageDescription}</p>
          <p className="mt-5 text-3xl font-extrabold text-orange">{formatMoney(details.amountMinor, details.currency)}</p>
          <p className="mt-2 text-xs leading-5 text-slate">This price is valid until {new Date(details.expiresAt).toLocaleString("en-NG")}.</p>
        </article>
      </div>

      <form action={accept} className="mt-5 rounded-3xl bg-white p-5 sm:p-6">
        <label className="grid gap-2 text-sm font-bold text-navy">
          Who will pay for this delivery?
          <select name="payer" className="min-h-12 rounded-2xl border border-slate/25 bg-white px-4 text-base font-normal outline-none focus:border-orange focus:ring-4 focus:ring-orange/10">
            <option value="sender">I will pay</option>
            <option value="receiver_before_delivery">The receiver will pay before delivery</option>
            <option value="receiver_at_delivery">The receiver will pay at delivery</option>
          </select>
        </label>
        <p className="mt-3 rounded-2xl bg-cloud p-4 text-sm leading-6 text-slate">
          We will show the correct secure payment link after you confirm. Choosing receiver payment does not charge anyone now.
        </p>
        <label className="mt-5 flex min-h-12 items-start gap-3 text-sm leading-6 text-slate">
          <input required name="termsAccepted" type="checkbox" className="mt-1 size-5 shrink-0 accent-orange" />
          <span>I have checked these details and agree to the delivery and payment terms.</span>
        </label>
        <Button className="mt-5 min-h-12 w-full" disabled={pending} type="submit">
          {pending ? "Confirming your delivery…" : "Confirm delivery"}
        </Button>
        {message ? <p role="alert" className="mt-4 rounded-2xl bg-amber-50 p-4 text-sm leading-6 text-amber-900">{message}</p> : null}
      </form>
    </div>
  );
}
