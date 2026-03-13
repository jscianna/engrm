/**
 * Restore memory from archive
 */

import { validateApiKey } from "@/lib/api-auth";
import { FatHippoError, errorResponse } from "@/lib/errors";
import { restoreFromArchive } from "@/lib/memory-lifecycle";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const identity = await validateApiKey(request, "lifecycle.restore");
    
    const body = await request.json().catch(() => ({}));
    const memoryId = body.memoryId || body.id;
    
    if (!memoryId || typeof memoryId !== "string") {
      throw new FatHippoError("VALIDATION_ERROR", { field: "memoryId", reason: "required" });
    }
    
    const restored = await restoreFromArchive(identity.userId, memoryId);
    
    if (!restored) {
      throw new FatHippoError("MEMORY_NOT_FOUND", { 
        reason: "Memory not found in archive or already active" 
      });
    }
    
    return Response.json({
      success: true,
      memoryId,
      message: "Memory restored from archive",
    });
  } catch (error) {
    return errorResponse(error);
  }
}
