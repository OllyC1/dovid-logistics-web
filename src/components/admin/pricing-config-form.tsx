"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import type { FinancialConfig } from "@/features/pricing/types";

const fields:Array<{key:keyof FinancialConfig;label:string;scale?:number}>=[
  {key:"fuelPricePerLitreKobo",label:"Fuel price per litre (NGN)",scale:100},
  {key:"motorcycleFuelEfficiencyKmPerLitre",label:"Fuel efficiency (km/litre)"},
  {key:"riderBaseSalaryMonthlyKobo",label:"Rider base salary monthly (NGN)",scale:100},
  {key:"riderMaximumBonusMonthlyKobo",label:"Maximum rider bonus monthly (NGN)",scale:100},
  {key:"maintenanceReservePerKmKobo",label:"Maintenance reserve per km (NGN)",scale:100},
  {key:"depreciationReservePerKmKobo",label:"Depreciation reserve per km (NGN)",scale:100},
  {key:"overheadPerBikeMonthlyKobo",label:"Monthly overhead per bike (NGN)",scale:100},
  {key:"targetDeliveriesPerBikePerDay",label:"Target deliveries per bike/day"},
  {key:"targetOperatingMarginBps",label:"Target margin (basis points)"},
  {key:"competitorDiscountTargetBps",label:"Competitor discount target (basis points)"},
  {key:"minimumCustomerFareKobo",label:"Minimum customer fare (NGN)",scale:100},
  {key:"roundingIncrementKobo",label:"Rounding increment (NGN)",scale:100}
];

export function PricingConfigForm({configurationId,config}:{configurationId:string;config:FinancialConfig}){
  const[state,setState]=useState({pending:false,message:"",ok:false});
  async function submit(event:React.FormEvent<HTMLFormElement>){event.preventDefault();setState({pending:true,message:"",ok:false});const form=new FormData(event.currentTarget);const assumptions={...config};for(const field of fields){const value=Number(form.get(String(field.key)));(assumptions as unknown as Record<string,unknown>)[field.key]=Math.round(value*(field.scale??1))}const response=await fetch("/api/admin/pricing/config",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({configurationId,assumptions,changeReason:form.get("changeReason")})});const body=await response.json();setState({pending:false,message:response.ok?`Draft version ${body.version} created.`:body.error,ok:response.ok})}
  return <form onSubmit={submit} className="grid gap-5"><div className="grid gap-4 md:grid-cols-2">{fields.map(field=><Field key={String(field.key)} name={String(field.key)} label={field.label} type="number" min={0} step={field.scale?"0.01":"1"} defaultValue={Number(config[field.key])/(field.scale??1)} required/>)}</div><Field name="changeReason" label="Change reason" minLength={5} required/>{state.message?<div role="status" className={`rounded-2xl p-4 text-sm ${state.ok?"bg-emerald-50 text-emerald-800":"bg-red-50 text-red-800"}`}><p>{state.message}</p>{state.ok?<a href="/admin/history" className="mt-3 inline-flex min-h-11 items-center font-bold underline">Review and activate in Pricing history</a>:null}</div>:null}<Button type="submit" disabled={state.pending}>{state.pending?"Saving version…":"Create draft version"}</Button></form>
}
