"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
export function ActivateVersionButton({id}:{id:string}){const[pending,setPending]=useState(false);async function activate(){const reason=window.prompt("Reason for activating this pricing version");if(!reason)return;setPending(true);const response=await fetch(`/api/admin/pricing/config/${id}/activate`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({reason})});setPending(false);if(response.ok)location.reload();else alert((await response.json()).error)}return <Button variant="outline" disabled={pending} onClick={activate}>{pending?"Activating…":"Activate"}</Button>}
