"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ActionFeedback } from "@/components/ui/action-feedback";
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

const successMessages: Partial<Record<DeliveryStatus, string>> = {
  rider_en_route_to_pickup: "Pickup journey started. The next step is ready.",
  picked_up: "Pickup confirmed. You can now start the delivery journey.",
  in_transit: "Delivery journey started. The next step is ready.",
  arrived_at_destination: "Arrival recorded. The waiting timer has started automatically. Confirm the recipient before handover.",
  awaiting_payment: "Payment hold recorded. Do not release the parcel yet.",
  delivered: "Delivery completed and recorded.",
  delivery_failed: "Delivery issue recorded for dispatch review."
};

export function RiderStatusControls({orderId,currentStatus,paymentStatus}:{orderId:string;currentStatus:DeliveryStatus;paymentStatus:PaymentStatus}){
  const router=useRouter();
  const [optimisticStatus,setOptimisticStatus]=useState<{ server: DeliveryStatus; value: DeliveryStatus } | null>(null);
  const [state,setState]=useState({pending:"",error:"",success:""});
  const displayStatus=optimisticStatus?.server===currentStatus?optimisticStatus.value:currentStatus;
  const targets=allowedTransitions[displayStatus].filter(status=>riderStatuses.has(status)&&!(status==="delivered"&&paymentStatus!=="paid"));

  async function transition(status:DeliveryStatus){
    setState({pending:status,error:"",success:""});
    try {
      const response=await fetch(`/api/rider/orders/${orderId}/status`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({status,idempotencyKey:crypto.randomUUID()})});
      const body=await response.json().catch(()=>({}));
      if(!response.ok)return setState({pending:"",error:body.error??"Status update failed",success:""});
      setOptimisticStatus({server:currentStatus,value:status});
      setState({pending:"",error:"",success:successMessages[status]??"Delivery status updated."});
      router.refresh();
    } catch {
      setState({pending:"",error:"We could not update the delivery. Check your connection and try again.",success:""});
    }
  }

  if(targets.length===0)return null;
  return <section className="mt-5 rounded-3xl bg-white p-4 sm:p-6" aria-labelledby="rider-status-actions"><h2 id="rider-status-actions" className="font-extrabold text-navy">Update delivery status</h2><div className="mt-4 grid gap-3 sm:flex sm:flex-wrap">{targets.map(status=><Button className="w-full sm:w-auto" key={status} type="button" variant={status==="delivery_failed"?"outline":"primary"} disabled={Boolean(state.pending)} onClick={()=>transition(status)}>{state.pending===status?"Updating…":labels[status]??status.replaceAll("_"," ")}</Button>)}</div><ActionFeedback feedback={state.error?{text:state.error,ok:false}:state.success?{text:state.success,ok:true}:null} pending={Boolean(state.pending)} pendingText="Updating delivery status…" onDismiss={()=>setState(current=>({...current,error:"",success:""}))}/></section>;
}
