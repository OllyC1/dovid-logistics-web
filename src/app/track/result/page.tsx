import { redirect } from "next/navigation";
export default async function TrackResult({searchParams}:{searchParams:Promise<{reference?:string}>}){const {reference}=await searchParams;redirect(`/track/${encodeURIComponent(reference??"")}`)}
