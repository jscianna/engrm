import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { runDreamCycle } from "@/lib/dream-cycle";

export const runtime = "nodejs";

export async function POST() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runDreamCycle(userId);
    return NextResponse.json({ result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Dream cycle failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
