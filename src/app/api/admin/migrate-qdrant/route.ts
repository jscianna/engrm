/**
 * Admin endpoint to migrate vectors from Turso to Qdrant
 * 
 * POST /api/admin/migrate-qdrant
 * Headers: Authorization: Bearer <admin-key>
 * Body: { userId?: string } - Optional, migrate specific user or all
 */

import { migrateFromTurso, getQdrantStatus } from "@/lib/qdrant";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

// Simple admin key check (set ADMIN_API_KEY in env)
function isAdmin(request: Request): boolean {
  const authHeader = request.headers.get("authorization");
  const adminKey = process.env.ADMIN_API_KEY;
  
  if (!adminKey) {
    console.warn("[Admin] ADMIN_API_KEY not set");
    return false;
  }
  
  return authHeader === `Bearer ${adminKey}`;
}

export async function GET(request: Request) {
  if (!isAdmin(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  
  const status = getQdrantStatus();
  return NextResponse.json({ status });
}

export async function POST(request: Request) {
  if (!isAdmin(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  
  const status = getQdrantStatus();
  if (!status.enabled) {
    return NextResponse.json({ 
      error: "Qdrant not configured",
      hint: "Set QDRANT_URL and QDRANT_API_KEY environment variables",
    }, { status: 400 });
  }
  
  try {
    const body = await request.json().catch(() => ({}));
    const userId = typeof body.userId === "string" ? body.userId : undefined;
    
    console.log(`[Migration] Starting migration${userId ? ` for user ${userId}` : " for all users"}`);
    
    const result = await migrateFromTurso(userId);
    
    return NextResponse.json({
      success: true,
      ...result,
      message: `Migrated ${result.migrated} vectors to Qdrant`,
    });
  } catch (error) {
    console.error("[Migration] Failed:", error);
    return NextResponse.json({ 
      error: "Migration failed",
      details: error instanceof Error ? error.message : "Unknown error",
    }, { status: 500 });
  }
}
