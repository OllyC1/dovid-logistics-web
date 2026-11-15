"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
export function ActivateRateCardButton({id}:{id:string}){const[pending,setPending]=useState(false);async function activate(){setPending(true);const response=await fetch(`/api/admin/pricing/rate-cards/${id}/activate`,{method:"POST"});if(response.ok)location.reload();else setPending(false)}return <Button type="button" variant="outline" disabled={pending} onClick={activate}>{pending?"Activating…":"Activate"}</Button>}
