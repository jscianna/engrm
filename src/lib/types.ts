export type MemorySourceType = "text" | "url" | "file";

export type MemoryRecord = {
  id: string;
  userId: string;
  title: string;
  sourceType: MemorySourceType;
  sourceUrl: string | null;
  fileName: string | null;
  contentText: string;
  contentHash: string;
  arweaveTxId: string | null;
  createdAt: string;
};

export type MemoryListItem = Omit<MemoryRecord, "contentText">;

export type MemorySearchResult = {
  score: number;
  memory: MemoryListItem;
};
