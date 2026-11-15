import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json({ error: "Direct role assignment is disabled. Use the audited Team Management invitation workflow." }, { status: 410 });
}
