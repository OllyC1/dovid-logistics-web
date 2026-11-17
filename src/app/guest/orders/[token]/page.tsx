import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { GuestPaymentForm } from "@/components/payments/guest-payment-form";
import { GuestReceiverLink } from "@/components/payments/guest-receiver-link";
import { GuestSupplementalCharge } from "@/components/payments/guest-supplemental-charge";
import { hashAssistedSecret } from "@/features/assisted-bookings/security";
import { customerOperationMessage } from "@/features/operations/status-messages";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { formatMoney, formatPaymentStatus } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Your delivery",
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
};

type StatusEvent = { id: string; new_status: string; created_at: string };
type Surcharge = { id: string; category: string; description: string; proposed_amount_kobo: number; approved_amount_kobo: number | null; status: string };

export default async function GuestOrderPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (token.length < 40 || token.length > 128) notFound();
  const admin = createSupabaseAdminClient();
  const { data: access } = await admin.from("guest_order_access_tokens")
    .select("id,order_id,expires_at,revoked_at")
    .eq("token_hash", hashAssistedSecret(token))
    .maybeSingle();
  if (!access || access.revoked_at || new Date(access.expires_at) <= new Date()) notFound();

  const { data: order } = await admin.from("delivery_orders")
    .select("id,order_reference,tracking_reference,pickup_address,delivery_address,payer,payment_status,delivery_status,quoted_amount_minor,currency,created_at,customer_id,assisted_booking_draft_id,delivery_status_events(id,new_status,created_at)")
    .eq("id", access.order_id)
    .maybeSingle();
  if (!order || order.customer_id || !order.assisted_booking_draft_id) notFound();
  const [{ data: surcharges }] = await Promise.all([
    admin.from("customer_surcharges").select("id,category,description,proposed_amount_kobo,approved_amount_kobo,status").eq("order_id", order.id).order("created_at", { ascending: false }),
    admin.from("guest_order_access_tokens").update({ last_used_at: new Date().toISOString() }).eq("id", access.id),
  ]);

  const events = [...((order.delivery_status_events ?? []) as StatusEvent[])].sort(
    (left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime(),
  );
  const terminal = ["cancelled", "delivered"].includes(order.delivery_status);
  const paymentOutstanding = order.payment_status !== "paid" && !terminal;

  return (
    <section className="container max-w-3xl py-8 sm:py-12">
      <div className="flex justify-center">
        <Link href="/" aria-label="Dovid Logistics home">
          <Image src="/brand/dovid-primary.svg" alt="Dovid Logistics" width={180} height={46} priority />
        </Link>
      </div>
      <div className="mt-7 rounded-3xl bg-white p-5 shadow-sm sm:p-7">
        <p className="text-sm font-bold text-orange">Delivery confirmed</p>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-3xl font-extrabold text-navy">Your delivery</h1>
            <p className="mt-1 text-sm text-slate">{order.order_reference}</p>
          </div>
          <span className="rounded-full bg-orange/10 px-4 py-2 text-sm font-bold text-orange">
            {customerOperationMessage(order.delivery_status)}
          </span>
        </div>
        <p className="mt-5 rounded-2xl bg-cloud p-4 text-sm leading-6 text-slate">
          Save this private page. You can return here to pay, share a receiver payment link and check delivery updates. No account is needed.
        </p>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <article className="rounded-3xl bg-white p-5 sm:p-6">
          <h2 className="font-extrabold text-navy">Pickup and delivery</h2>
          <div className="mt-4 grid gap-3 text-sm leading-6 text-slate">
            <div><p className="font-bold text-navy">Pickup</p><p>{order.pickup_address}</p></div>
            <div aria-hidden="true" className="pl-2 text-xl text-orange">↓</div>
            <div><p className="font-bold text-navy">Delivery</p><p>{order.delivery_address}</p></div>
          </div>
        </article>

        <article className="rounded-3xl bg-white p-5 sm:p-6">
          <h2 className="font-extrabold text-navy">Payment</h2>
          <p className="mt-3 text-3xl font-extrabold text-orange">{formatMoney(order.quoted_amount_minor, order.currency)}</p>
          <p className="mt-2 text-sm font-bold text-navy">{formatPaymentStatus(order.payment_status)}</p>
          {paymentOutstanding && order.payer === "sender" ? (
            <>
              <p className="mt-4 text-sm leading-6 text-slate">Enter an email address for the receipt, then continue to Paystack&apos;s secure checkout.</p>
              <GuestPaymentForm token={token} />
            </>
          ) : null}
          {paymentOutstanding && order.payer !== "sender" ? <GuestReceiverLink orderId={order.id} guestToken={token} /> : null}
          {order.payment_status === "paid" ? <p className="mt-4 rounded-2xl bg-emerald-50 p-4 text-sm font-bold text-emerald-800">Payment has been verified.</p> : null}
          {terminal && order.payment_status !== "paid" ? <p className="mt-4 rounded-2xl bg-cloud p-4 text-sm font-bold text-navy">This delivery is closed. No payment can be started.</p> : null}
        </article>
      </div>

      <article className="mt-4 rounded-3xl bg-white p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-extrabold text-navy">Delivery updates</h2>
          <Link href={`/track/${order.tracking_reference}`} className="min-h-11 rounded-full border border-navy/15 px-4 py-2.5 text-sm font-bold text-navy">
            Open tracking page
          </Link>
        </div>
        <ol className="mt-5 grid gap-4">
          {events.map((event) => (
            <li key={event.id} className="border-l-2 border-orange pl-4">
              <p className="font-bold text-navy">{customerOperationMessage(event.new_status)}</p>
              <time className="text-xs text-slate">{new Date(event.created_at).toLocaleString("en-NG")}</time>
            </li>
          ))}
        </ol>
      </article>

      {(surcharges ?? []).length ? (
        <article className="mt-4 rounded-3xl bg-white p-5 sm:p-6">
          <h2 className="font-extrabold text-navy">Additional delivery charges</h2>
          <p className="mt-2 text-sm leading-6 text-slate">Any waiting, toll or redelivery charge must be approved separately. Nothing is charged automatically.</p>
          <div className="mt-5 grid gap-3">
            {(surcharges as Surcharge[]).map((surcharge) => (
              <GuestSupplementalCharge
                key={surcharge.id}
                id={surcharge.id}
                token={token}
                category={surcharge.category}
                description={surcharge.description}
                amountMinor={surcharge.approved_amount_kobo ?? surcharge.proposed_amount_kobo}
                currency={order.currency}
                status={surcharge.status}
              />
            ))}
          </div>
        </article>
      ) : null}
    </section>
  );
}
