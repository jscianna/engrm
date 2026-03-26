import { beforeEach, describe, expect, it, vi } from "vitest";

const embedText = vi.fn();
const semanticSearchVectors = vi.fn();
const getAgentMemoriesByIds = vi.fn();
const updateAgentMemory = vi.fn();
const createMemoryEdge = vi.fn();
const extractEntities = vi.fn();

vi.mock("@/lib/embeddings", () => ({
  embedText,
}));

vi.mock("@/lib/qdrant", () => ({
  semanticSearchVectors,
}));

vi.mock("@/lib/db", () => ({
  getAgentMemoriesByIds,
  updateAgentMemory,
  createMemoryEdge,
}));

vi.mock("@/lib/entities", () => ({
  extractEntities,
}));

describe("runMicroDream", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("skips trivial memories before embedding", async () => {
    const { runMicroDream } = await import("@/lib/micro-dream");

    await expect(
      runMicroDream({
        userId: "user-1",
        memoryId: "mem-1",
        memoryText: "short memory",
        namespaceId: null,
      }),
    ).resolves.toMatchObject({ action: "none" });

    expect(embedText).not.toHaveBeenCalled();
    expect(semanticSearchVectors).not.toHaveBeenCalled();
  });

  it("merges with a longer existing memory and absorbs the new one", async () => {
    const { runMicroDream } = await import("@/lib/micro-dream");

    embedText.mockResolvedValue([0.1, 0.2, 0.3]);
    semanticSearchVectors.mockResolvedValue([
      { item: { id: "existing-1" }, score: 0.95 },
    ]);
    getAgentMemoriesByIds.mockResolvedValue([
      {
        id: "existing-1",
        text: "This is the longer existing memory that already contains more detail.",
        absorbed: false,
      },
    ]);

    await expect(
      runMicroDream({
        userId: "user-1",
        memoryId: "mem-1",
        memoryText: "This new memory is detailed enough to trigger merge logic.",
        namespaceId: null,
      }),
    ).resolves.toMatchObject({
      action: "merged",
      mergedWith: "existing-1",
    });

    expect(updateAgentMemory).toHaveBeenCalledWith("user-1", "mem-1", {
      supersededBy: "existing-1",
      confidenceScore: 0.45,
      lastVerifiedAt: expect.any(String),
    });
    expect(createMemoryEdge).toHaveBeenCalledWith(expect.objectContaining({
      userId: "user-1",
      sourceId: "mem-1",
      targetId: "existing-1",
      relationshipType: "updates",
    }));
  });

  it("updates an existing near-duplicate when the new memory is more detailed", async () => {
    const { runMicroDream } = await import("@/lib/micro-dream");

    const memoryText =
      "This new memory is much more detailed than the old entry and should replace it in the merged record.";

    embedText.mockResolvedValue([0.1, 0.2, 0.3]);
    semanticSearchVectors.mockResolvedValue([
      { item: { id: "existing-2" }, score: 0.96 },
    ]);
    getAgentMemoriesByIds.mockResolvedValue([
      {
        id: "existing-2",
        text: "Old detailed memory.",
        absorbed: false,
      },
    ]);

    await expect(
      runMicroDream({
        userId: "user-1",
        memoryId: "mem-2",
        memoryText,
        namespaceId: "ns-1",
      }),
    ).resolves.toMatchObject({
      action: "merged",
      mergedWith: "existing-2",
    });

    expect(updateAgentMemory).toHaveBeenCalledWith("user-1", "existing-2", {
      text: memoryText,
      supersededBy: "mem-2",
      confidenceScore: 0.5,
      lastVerifiedAt: expect.any(String),
    });
    expect(createMemoryEdge).toHaveBeenCalledWith(expect.objectContaining({
      userId: "user-1",
      sourceId: "existing-2",
      targetId: "mem-2",
      relationshipType: "updates",
    }));
  });

  it("flags contradictions when negation overlaps entities with an older memory", async () => {
    const { runMicroDream } = await import("@/lib/micro-dream");

    const memoryText =
      "John no longer uses Redis for caching after switching to SQLite-backed local storage.";

    embedText.mockResolvedValue([0.1, 0.2, 0.3]);
    semanticSearchVectors.mockResolvedValue([
      { item: { id: "existing-3" }, score: 0.88 },
    ]);
    getAgentMemoriesByIds.mockResolvedValue([
      {
        id: "existing-3",
        text: "John uses Redis for caching in the project.",
        absorbed: false,
      },
    ]);
    extractEntities.mockImplementation((text: string) =>
      text.includes("John") ? ["John", "Redis"] : [],
    );

    await expect(
      runMicroDream({
        userId: "user-2",
        memoryId: "mem-3",
        memoryText,
        namespaceId: null,
      }),
    ).resolves.toMatchObject({
      action: "contradiction_resolved",
      contradictionId: "existing-3",
    });

    expect(updateAgentMemory).toHaveBeenCalledWith("user-2", "existing-3", {
      supersededBy: "mem-3",
      confidenceScore: 0.35,
      conflictsWith: ["mem-3"],
      lastVerifiedAt: expect.any(String),
    });
    expect(updateAgentMemory).toHaveBeenCalledWith("user-2", "mem-3", {
      conflictsWith: ["existing-3"],
      lastVerifiedAt: expect.any(String),
    });
    expect(createMemoryEdge).toHaveBeenCalledWith(expect.objectContaining({
      userId: "user-2",
      sourceId: "existing-3",
      targetId: "mem-3",
      relationshipType: "contradicts",
    }));
  });
});
