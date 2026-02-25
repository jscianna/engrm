export type MemorySourceType = "text" | "url" | "file";
export type MemoryKind = "episodic" | "semantic" | "procedural" | "self-model";

export type MemoryRecord = {
  id: string;
  userId: string;
  title: string;
  sourceType: MemorySourceType;
  memoryType: MemoryKind;
  importance: number;
  tags: string[];
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

export type MemoryDashboardStats = {
  totalMemories: number;
  committedMemories: number;
  pendingMemories: number;
  storageBytes: number;
};

export type ArweaveWalletStatus = {
  source: "user" | "env" | "none";
  hasWallet: boolean;
  address: string | null;
  balanceAr: string | null;
  token: string;
};
