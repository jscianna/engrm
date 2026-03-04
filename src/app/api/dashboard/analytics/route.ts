import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getAnalyticsSummary } from "@/lib/analytics";

export const runtime = "nodejs";

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const summary = await getAnalyticsSummary(userId);
    return NextResponse.json(summary);
  } catch (error) {
    console.error("[Dashboard Analytics API] Error:", error);
    return NextResponse.json(
      { error: "Failed to load analytics" },
      { status: 500 }
    );
  }
}
