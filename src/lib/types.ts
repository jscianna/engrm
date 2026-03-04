export type MemorySourceType = "text" | "url" | "file" | "pdf";
export type MemoryKind = 
  | "episodic" 
  | "semantic" 
  | "procedural" 
  | "self-model"
  | "reflected"
  | "session_summary"
  | "compacted"
  // New types from auto-memory spec v2
  | "constraint"
  | "identity"
  | "relationship"
  | "preference"
  | "how_to"
  | "fact"
  | "event"
  // New types for enhanced classification
  | "belief"
  | "decision";
export type MemorySyncStatus = "pending" | "synced" | "failed";
export type MemoryImportanceTier = "critical" | "high" | "normal";
export type MemoryRelationshipType =
  | "similar"
  | "updates"
  | "contradicts"
  | "extends"
  | "derives_from"
  | "references"
  | "same_entity";

export type MemoryEdgeRecord = {
  id: string;
  userId: string;
  sourceId: string;
  targetId: string;
  relationshipType: MemoryRelationshipType;
  weight: number;
  metadata: Record<string, unknown> | null;
  createdAt: string;
};

export type MemoryRecord = {
  id: string;
  userId: string;
  title: string;
  sourceType: MemorySourceType;
  memoryType: MemoryKind;
  importance: number;
  importanceTier: MemoryImportanceTier;
  tags: string[];
  sourceUrl: string | null;
  fileName: string | null;
  contentText: string;
  contentIv: string | null;
  isEncrypted: boolean;
  contentHash: string;
  /** @deprecated Legacy database field retained for compatibility. */
  arweaveTxId: string | null;
  syncStatus: MemorySyncStatus;
  syncError: string | null;
  entities?: string[];
  feedbackScore?: number;
  accessCount?: number;
  createdAt: string;
  relationshipCount?: number;
  supersededByCount?: number;
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

export type MemoryGraphNode = {
  id: string;
  title: string;
  memoryType: MemoryKind;
  importance: number;
};

export type MemoryGraphEdge = {
  id: string;
  source: string;
  target: string;
  relationshipType: MemoryRelationshipType;
  weight: number;
};
