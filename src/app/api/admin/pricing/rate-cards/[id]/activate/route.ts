import { NextResponse, type NextRequest } from "next/server";
import { getAuthenticatedRole } from "@/lib/auth/roles";

export async function POST(_request:NextRequest,{params}:{params:Promise<{id:string}>}){const auth=await getAuthenticatedRole();if(auth?.role!=="admin")return NextResponse.json({error:"Admin authorization required"},{status:403});const{id}=await params;const{error}=await auth.supabase.rpc("activate_rate_card",{target_rate_card_id:id});if(error)return NextResponse.json({error:error.message||"Rate card could not be activated"},{status:400});return NextResponse.json({id,active:true})}
