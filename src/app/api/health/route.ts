/**
 * Health check endpoint - also keeps search function warm
 * Called by cron every 10 minutes to prevent cold starts
 */

export const runtime = "nodejs";

export async function GET() {
  // Warm the search endpoint by importing its dependencies
  await import("@/lib/db");
  await import("@/lib/embeddings");
  await import("@/lib/qdrant");
  
  return Response.json({ 
    status: "ok", 
    timestamp: new Date().toISOString(),
    warm: true
  });
}
