"use server";

import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { deleteAgentMemoryById, getAgentMemoryById } from "@/lib/db";
import { recordMemoryDeleted } from "@/lib/rate-limiter";
import { invalidateLocalResultsByMemoryIds } from "@/lib/local-retrieval";

export async function deleteMemoryAction(
  memoryId: string,
): Promise<{ error?: string }> {
  const { userId } = await auth();
  if (!userId) redirect("/");

  try {
    // Get memory first to know the size
    const memory = await getAgentMemoryById(userId, memoryId, {
      excludeSensitive: true,
    });
    if (!memory) {
      return { error: "Memory not found" };
    }

    const deleted = await deleteAgentMemoryById(userId, memoryId);
    if (!deleted) {
      return { error: "Failed to delete memory" };
    }

    // Invalidate any local retrieval cache entries
    invalidateLocalResultsByMemoryIds(userId, [memoryId]);

    // Track storage reduction
    const sizeBytes = Buffer.byteLength(memory.text, "utf8");
    await recordMemoryDeleted(userId, sizeBytes);

    revalidatePath("/dashboard");
    return {};
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Failed to delete memory",
    };
  }
}
