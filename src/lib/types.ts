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
export type MemoryImportanceTier = "critical" | "working" | "high" | "normal";
export type MemoryRelationshipType =
  | "similar"
  | "updates"
  | "contradicts"
  | "extends"
  | "derives_from"
  | "references"
  | "same_entity";

// Decentralized memory graph types
export type GraphNodeType = "memory" | "synthesis";
export type GraphEdgeType =
  | "derives_from"   // synthesis derives from source memories
  | "relates_to"     // semantic similarity / association
  | "abstracts"      // higher-level synthesis abstracting lower ones
  | "contradicts"    // conflicting information
  | "updates"        // newer info superseding older
  | "same_entity";   // different memories about same entity

export type GraphEdgeRecord = {
  id: string;
  userId: string;
  sourceId: string;
  sourceType: GraphNodeType;
  targetId: string;
  targetType: GraphNodeType;
  edgeType: GraphEdgeType;
  weight: number;
  bidirectional: boolean;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string | null;
};

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
  /** If true, memory contains detected secrets and is excluded from LLM context */
  sensitive: boolean;
  syncStatus: MemorySyncStatus;
  syncError: string | null;
  entities?: string[];
  feedbackScore?: number;
  accessCount?: number;
  promotionLocked?: boolean;
  /** Lock memory at a specific tier - prevents both promotion past and demotion below this tier */
  lockedTier?: MemoryImportanceTier | null;
  /** If true, memory is immune to automatic decay */
  decayImmune?: boolean;
  /** Task-like memory is complete (triggers demotion from critical) */
  completed?: boolean;
  completedAt?: string | null;
  /** Short-lived memory (design changes, tactical decisions) */
  ephemeral?: boolean;
  /** True when memory has been absorbed into a synthesized principle */
  absorbed?: boolean;
  /** Canonical synthesis ID replacing this memory in injection contexts */
  absorbedIntoSynthesisId?: string | null;
  /** ID of synthesis that absorbed this memory (excluded from direct injection) */
  absorbedBy?: string | null;
  absorbedAt?: string | null;
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

export type SynthesizedMemoryRecord = {
  id: string;
  userId: string;
  synthesis: string;
  title: string;
  sourceMemoryIds: string[];
  sourceCount: number;
  clusterId: string;
  clusterTopic: string;
  compressionRatio: number | null;
  confidence: number | null;
  synthesizedAt: string;
  lastValidatedAt: string;
  stale: boolean;
  importanceTier: Extract<MemoryImportanceTier, "critical" | "high" | "normal">;
  accessCount: number;
  createdAt: string;
  /** Abstraction level: 1=first-order synthesis, 2+=meta-synthesis (patterns of patterns) */
  abstractionLevel: number;
};
