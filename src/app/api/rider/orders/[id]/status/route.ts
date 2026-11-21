import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { canTransition } from "@/features/orders/state-machine";
import { getAuthenticatedRole } from "@/lib/auth/roles";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { deliveryStatuses, type DeliveryStatus } from "@/types/domain";

const schema=z.object({status:z.enum(deliveryStatuses),idempotencyKey:z.uuid()});
const riderStatuses=new Set<DeliveryStatus>(["rider_en_route_to_pickup","picked_up","in_transit","arrived_at_destination","awaiting_payment","delivered","delivery_failed"]);

export async function POST(request:NextRequest,{params}:{params:Promise<{id:string}>}){
  try{
    const auth=await getAuthenticatedRole();
    if(!auth)return NextResponse.json({error:"Authentication required"},{status:401});
    if(!["rider","admin"].includes(auth.role))return NextResponse.json({error:"Rider authorization required"},{status:403});
    const parsed=schema.safeParse(await request.json().catch(()=>null));
    if(!parsed.success)return NextResponse.json({error:"Invalid delivery status"},{status:400});
    if(auth.role==="rider"&&!riderStatuses.has(parsed.data.status))return NextResponse.json({error:"Riders cannot apply that status"},{status:403});

    const {id}=await params;
    const {data:order}=await auth.supabase.from("delivery_orders").select("id,rider_id,delivery_status,payment_status,payer").eq("id",id).maybeSingle();
    if(!order)return NextResponse.json({error:"Assigned order not found"},{status:404});
    if(auth.role==="rider"&&order.rider_id!==auth.user.id)return NextResponse.json({error:"Order is not assigned to this rider"},{status:403});

    const currentStatus=order.delivery_status as DeliveryStatus;
    const nextStatus=parsed.data.status;
    if (nextStatus === "picked_up" && order.payer === "sender" && order.payment_status !== "paid") {
      return NextResponse.json({ error: "Sender payment must be verified before pickup." }, { status: 409 });
    }
    if(!canTransition(currentStatus,nextStatus))return NextResponse.json({error:"Invalid status transition"},{status:409});
    const admin=createSupabaseAdminClient();
    if(nextStatus==="delivered"){
      const {error}=await admin.rpc("complete_delivery_handover",{target_order_id:id,actor_id:auth.user.id,request_idempotency_key:parsed.data.idempotencyKey});
      if(error)return NextResponse.json({error:error.message},{status:409});
      return NextResponse.json({status:nextStatus});
    }
    const {error}=await admin.rpc("transition_delivery_order",{order_id:id,new_status:nextStatus,metadata:{source:"rider_workspace",actorUserId:auth.user.id,actorRole:auth.role}});
    if(error)return NextResponse.json({error:error.message},{status:409});
    if(nextStatus==="picked_up"){
      const{data:assignment}=await admin.from("delivery_assignments").select("delivery_run_id").eq("order_id",id).is("released_at",null).maybeSingle();
      await admin.from("parcel_custody_events").upsert({order_id:id,run_id:assignment?.delivery_run_id??null,rider_id:auth.user.id,event_type:"pickup_confirmed",evidence:{source:"rider_workspace"},recorded_by:auth.user.id,idempotency_key:parsed.data.idempotencyKey},{onConflict:"idempotency_key",ignoreDuplicates:true});
      await admin.from("run_assignments").update({status:"onboard"}).eq("order_id",id);
    }
    return NextResponse.json({status:nextStatus});
  }catch(error){
    return NextResponse.json({error:error instanceof Error?error.message:"Status update unavailable"},{status:503});
  }
}
