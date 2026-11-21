import { notFound } from "next/navigation";
import { RiderStatusControls } from "@/components/rider/status-controls";
import { DeliveryOperationsForms } from "@/components/rider/delivery-operations-forms";
import { DeliveryProofForm } from "@/components/rider/delivery-proof-form";
import { ReturnToSenderForm } from "@/components/rider/return-to-sender-form";
import { ReceiverPaymentLink } from "@/components/rider/receiver-payment-link";
import { requireRole } from "@/lib/auth/roles";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { DeliveryStatus, PaymentStatus } from "@/types/domain";

export default async function RiderOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await requireRole(["rider", "admin"]);
  const { data: order } = await supabase
    .from("delivery_orders")
    .select("id,order_reference,pickup_address,delivery_address,sender_name,sender_phone,recipient_name,recipient_phone,additional_stops,delivery_status,payment_status,payer,service_level,scheduled_at,delivery_status_events(id,new_status,created_at)")
    .eq("id", id)
    .maybeSingle();

  if (!order) notFound();
  const [{ data: assignment }, { data: returningAssignment }, { data: proof }] = await Promise.all([
    supabase.from("delivery_assignments").select("delivery_run_id").eq("order_id", id).is("released_at", null).maybeSingle(),
    supabase.from("run_assignments").select("run_id").eq("order_id", id).eq("status", "returning").limit(1).maybeSingle(),
    createSupabaseAdminClient().from("delivery_proofs").select("completed_at,recipient_name").eq("order_id", id).maybeSingle(),
  ]);
  const additionalStops=(order.additional_stops??[]) as Array<{address:string}>;

  return <>
    <p className="eyebrow">Assigned delivery</p>
    <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
      <h1 className="break-words text-2xl font-extrabold text-navy sm:text-3xl">{order.order_reference}</h1>
      <span className="rounded-full bg-orange/10 px-4 py-2 text-sm font-bold capitalize text-orange">{order.delivery_status.replaceAll("_", " ")}</span>
    </div>
    {returningAssignment ? <div className="mt-7 rounded-2xl bg-amber-50 p-4 text-sm font-bold leading-6 text-amber-950">Return authorized by dispatch. Keep the parcel secure and hand it only to the confirmed sender or their authorized representative.</div> : <div className="mt-7 rounded-2xl bg-navy p-4 text-sm font-bold text-white">Release the parcel only when payment status is <span className="text-orange">paid</span>. Current status: <span className="capitalize">{order.payment_status}</span>.</div>}
    {!returningAssignment && order.payer !== "sender" && order.payment_status !== "paid" ? <ReceiverPaymentLink orderId={order.id}/> : null}
    {!returningAssignment ? <RiderStatusControls orderId={order.id} currentStatus={order.delivery_status as DeliveryStatus} paymentStatus={order.payment_status as PaymentStatus}/> : null}
    {!returningAssignment ? <DeliveryProofForm orderId={order.id} expectedRecipientName={order.recipient_name} deliveryStatus={order.delivery_status as DeliveryStatus} paymentStatus={order.payment_status as PaymentStatus} existingProof={proof ? { completedAt: proof.completed_at, recipientName: proof.recipient_name } : null}/> : null}
    {returningAssignment ? <ReturnToSenderForm orderId={order.id} expectedSenderName={order.sender_name} /> : null}
    <DeliveryOperationsForms orderId={order.id} runId={assignment?.delivery_run_id ?? returningAssignment?.run_id} returnInProgress={Boolean(returningAssignment)}/>
    <div className="mt-6 grid gap-5 lg:grid-cols-2">
      <article className="min-w-0 rounded-3xl bg-white p-4 sm:p-6"><h2 className="font-extrabold text-navy">Pickup</h2><p className="mt-4 break-words text-sm leading-7 text-slate">{order.pickup_address}<br/>{order.sender_name}<br/><a className="inline-flex min-h-10 items-center rounded-lg font-bold text-orange" href={`tel:${order.sender_phone}`}>{order.sender_phone}</a></p></article>
      <article className="min-w-0 rounded-3xl bg-white p-4 sm:p-6"><h2 className="font-extrabold text-navy">Drop-off</h2><p className="mt-4 break-words text-sm leading-7 text-slate">{order.delivery_address}<br/>{order.recipient_name}<br/><a className="inline-flex min-h-10 items-center rounded-lg font-bold text-orange" href={`tel:${order.recipient_phone}`}>{order.recipient_phone}</a></p></article>
    </div>
    {additionalStops.length?<article className="mt-5 min-w-0 rounded-3xl bg-white p-4 sm:p-6"><h2 className="font-extrabold text-navy">Intermediate stops</h2><ol className="mt-4 grid gap-3 text-sm text-slate">{additionalStops.map((stop,index)=><li key={`${stop.address}-${index}`} className="break-words rounded-2xl bg-cloud p-4"><span className="font-bold text-navy">Stop {index+1}:</span> {stop.address}</li>)}</ol></article>:null}
    <article className="mt-5 rounded-3xl bg-white p-4 sm:p-6"><h2 className="font-extrabold text-navy">Delivery timeline</h2><ol className="mt-5 grid gap-4">{order.delivery_status_events?.map(event=><li key={event.id} className="border-l-2 border-orange pl-4"><p className="font-bold capitalize text-navy">{event.new_status.replaceAll("_", " ")}</p><time className="text-xs text-slate">{new Date(event.created_at).toLocaleString("en-NG")}</time></li>)}</ol></article>
  </>;
}
