import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { processEmailQueue } from "@/lib/notifications/queue";

export const runtime = "nodejs";

function authorized(request: NextRequest) {
  const configured = process.env.EMAIL_WORKER_SECRET;
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!configured || !supplied) return false;
  const left = Buffer.from(configured);
  const right = Buffer.from(supplied);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try { return NextResponse.json(await processEmailQueue(10)); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Email queue processing failed" }, { status: 503 }); }
}
