"use client";
import { useSyncExternalStore } from "react";

const subscribe=()=>()=>{};

export function ReceiverLink({orderId}:{orderId:string}){const token=useSyncExternalStore(subscribe,()=>sessionStorage.getItem(`dovid-receiver-token-${orderId}`),()=>null);if(!token)return null;const url=`${location.origin}/pay/receiver/${token}`;return <div className="mt-5 rounded-2xl bg-orange/10 p-5"><p className="text-sm font-bold text-navy">Receiver payment link</p><p className="mt-2 break-all text-sm text-orange">{url}</p><button type="button" className="mt-3 text-sm font-bold text-navy" onClick={()=>navigator.clipboard.writeText(url)}>Copy secure link</button></div>}
