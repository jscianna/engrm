import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getUsageStats } from "@/lib/rate-limiter";

export const runtime = "nodejs";

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const stats = await getUsageStats(userId);
    
    // Calculate storage cost estimate.
    const storageCostPerGB = 5;
    const storageGB = stats.storageBytes / (1024 * 1024 * 1024);
    const estimatedStorageCost = storageGB * storageCostPerGB;

    return NextResponse.json({
      usage: {
        apiCallsToday: stats.apiCallsToday,
        apiCallsThisMonth: stats.apiCallsThisMonth,
        memoriesThisMonth: stats.memoriesThisMonth,
        storageBytes: stats.storageBytes,
        estimatedStorageCost: Math.round(estimatedStorageCost * 100) / 100,
      },
      limits: stats.limits,
      percentages: {
        apiCallsToday: Math.round((stats.apiCallsToday / stats.limits.requestsPerDay) * 100),
        memoriesThisMonth: Math.round((stats.memoriesThisMonth / stats.limits.memoriesPerMonth) * 100),
        storageBytes: Math.round((stats.storageBytes / stats.limits.storageBytes) * 100),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to get usage stats";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
