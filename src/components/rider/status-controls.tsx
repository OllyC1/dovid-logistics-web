"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { allowedTransitions } from "@/features/orders/state-machine";
import type { DeliveryStatus, PaymentStatus } from "@/types/domain";

const riderStatuses = new Set<DeliveryStatus>([
  "rider_en_route_to_pickup",
  "picked_up",
  "in_transit",
  "arrived_at_destination",
  "awaiting_payment",
  "delivered",
  "delivery_failed"
]);

const labels: Partial<Record<DeliveryStatus, string>> = {
  rider_en_route_to_pickup: "Start pickup journey",
  picked_up: "Confirm pickup",
  in_transit: "Start delivery journey",
  arrived_at_destination: "Arrived at destination",
  awaiting_payment: "Mark awaiting payment",
  delivered: "Complete delivery",
  delivery_failed: "Report delivery issue"
};

export function RiderStatusControls({orderId,currentStatus,paymentStatus}:{orderId:string;currentStatus:DeliveryStatus;paymentStatus:PaymentStatus}){
  const router=useRouter();
  const [state,setState]=useState({pending:"",error:""});
  const targets=allowedTransitions[currentStatus].filter(status=>riderStatuses.has(status)&&!(status==="delivered"&&paymentStatus!=="paid"));

  async function transition(status:DeliveryStatus){
    setState({pending:status,error:""});
    const response=await fetch(`/api/rider/orders/${orderId}/status`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({status,idempotencyKey:crypto.randomUUID()})});
    const body=await response.json();
    if(!response.ok)return setState({pending:"",error:body.error??"Status update failed"});
    setState({pending:"",error:""});
    router.refresh();
  }

  if(targets.length===0)return null;
  return <section className="mt-5 rounded-3xl bg-white p-4 sm:p-6" aria-labelledby="rider-status-actions"><h3 id="rider-status-actions" className="font-extrabold text-navy">Update delivery status</h3><div className="mt-4 grid gap-3 sm:flex sm:flex-wrap">{targets.map(status=><Button className="w-full sm:w-auto" key={status} type="button" variant={status==="delivery_failed"?"outline":"primary"} disabled={Boolean(state.pending)} onClick={()=>transition(status)}>{state.pending===status?"Updating…":labels[status]??status.replaceAll("_"," ")}</Button>)}</div>{state.error?<p role="alert" className="mt-4 rounded-2xl bg-red-50 p-4 text-sm text-red-800">{state.error}</p>:null}</section>;
}
