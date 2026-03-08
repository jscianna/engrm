/**
 * Full-Text Search (BM25) via FTS5
 * 
 * Indexes memory titles and entities for exact-match keyword search.
 * Combined with vector search via RRF fusion for hybrid retrieval.
 * 
 * NOTE: Memory content is encrypted at rest, so we index only plaintext fields:
 * - title: Memory title/summary
 * - entities: Extracted entities (people, projects, concepts)
 */

import { getDb } from "./turso";

// =============================================================================
// Initialization
// =============================================================================

let ftsInitialized = false;

/**
 * Ensure FTS5 virtual table exists with proper triggers
 */
export async function ensureFtsInitialized(): Promise<void> {
  if (ftsInitialized) return;

  const client = getDb();

  await client.executeMultiple(`
    -- FTS5 virtual table for keyword search
    -- Indexed fields: title, entities (space-separated), user_id (for filtering)
    CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
      memory_id UNINDEXED,
      user_id UNINDEXED,
      title,
      entities,
      content='',
      contentless_delete=1
    );

    -- Trigger: Insert into FTS when memory is created
    CREATE TRIGGER IF NOT EXISTS memories_ai AFTER INSERT ON memories BEGIN
      INSERT INTO memories_fts(memory_id, user_id, title, entities)
      VALUES (
        NEW.id,
        NEW.user_id,
        NEW.title,
        COALESCE(
          (SELECT GROUP_CONCAT(value, ' ') FROM json_each(COALESCE(NEW.entities, NEW.entities_json, '[]'))),
          ''
        )
      );
    END;

    -- Trigger: Update FTS when memory is updated
    CREATE TRIGGER IF NOT EXISTS memories_au AFTER UPDATE ON memories BEGIN
      DELETE FROM memories_fts WHERE memory_id = OLD.id;
      INSERT INTO memories_fts(memory_id, user_id, title, entities)
      VALUES (
        NEW.id,
        NEW.user_id,
        NEW.title,
        COALESCE(
          (SELECT GROUP_CONCAT(value, ' ') FROM json_each(COALESCE(NEW.entities, NEW.entities_json, '[]'))),
          ''
        )
      );
    END;

    -- Trigger: Delete from FTS when memory is deleted
    CREATE TRIGGER IF NOT EXISTS memories_ad AFTER DELETE ON memories BEGIN
      DELETE FROM memories_fts WHERE memory_id = OLD.id;
    END;
  `);

  ftsInitialized = true;
}

/**
 * Backfill FTS index from existing memories
 * Run once after adding FTS to populate index for pre-existing data
 */
export async function backfillFtsIndex(userId?: string): Promise<{ indexed: number }> {
  await ensureFtsInitialized();
  const client = getDb();

  // Clear existing FTS entries for user (or all if no userId)
  if (userId) {
    await client.execute({
      sql: "DELETE FROM memories_fts WHERE user_id = ?",
      args: [userId],
    });
  } else {
    await client.execute("DELETE FROM memories_fts");
  }

  // Fetch memories to index
  const memories = await client.execute({
    sql: userId
      ? `SELECT id, user_id, title, entities, entities_json FROM memories WHERE user_id = ?`
      : `SELECT id, user_id, title, entities, entities_json FROM memories`,
    args: userId ? [userId] : [],
  });

  // Batch insert into FTS (explicit inserts for Turso compatibility)
  let indexed = 0;
  for (const row of memories.rows) {
    try {
      // Parse entities JSON
      const entitiesRaw = (row.entities as string | null) ?? (row.entities_json as string | null) ?? "[]";
      let entitiesText = "";
      try {
        const parsed = JSON.parse(entitiesRaw) as string[];
        entitiesText = Array.isArray(parsed) ? parsed.join(" ") : "";
      } catch {
        entitiesText = "";
      }

      await client.execute({
        sql: "INSERT INTO memories_fts(memory_id, user_id, title, entities) VALUES (?, ?, ?, ?)",
        args: [row.id, row.user_id, row.title, entitiesText],
      });
      indexed++;
    } catch (err) {
      console.warn(`[FTS] Failed to index memory ${row.id}:`, err);
    }
  }

  return { indexed };
}

// =============================================================================
// Search
// =============================================================================

export interface BM25SearchResult {
  memoryId: string;
  score: number;
  matchType: "title" | "entity" | "both";
}

/**
 * BM25 full-text search on titles and entities
 */
export async function bm25Search(params: {
  userId: string;
  query: string;
  topK?: number;
}): Promise<BM25SearchResult[]> {
  await ensureFtsInitialized();
  const client = getDb();

  const topK = params.topK ?? 30;
  
  // Escape special FTS5 characters and prepare query
  const sanitizedQuery = sanitizeFtsQuery(params.query);
  if (!sanitizedQuery) {
    return [];
  }

  try {
    const result = await client.execute({
      sql: `
        SELECT 
          memory_id,
          bm25(memories_fts, 0, 0, 1.0, 0.5) as score,
          highlight(memories_fts, 2, '<b>', '</b>') as title_match,
          highlight(memories_fts, 3, '<b>', '</b>') as entity_match
        FROM memories_fts
        WHERE user_id = ? AND memories_fts MATCH ?
        ORDER BY score
        LIMIT ?
      `,
      args: [params.userId, sanitizedQuery, topK],
    });

    return result.rows.map((row) => ({
      memoryId: row.memory_id as string,
      score: Math.abs(row.score as number), // BM25 returns negative scores
      matchType: determineMatchType(
        row.title_match as string,
        row.entity_match as string
      ),
    }));
  } catch (error) {
    // FTS query syntax errors shouldn't crash the search
    console.warn("[FTS] Search failed, falling back to empty:", error);
    return [];
  }
}

/**
 * Sanitize query for FTS5 syntax
 * Handles special characters and builds proper query
 */
function sanitizeFtsQuery(query: string): string {
  // Remove FTS5 special operators that could cause syntax errors
  const cleaned = query
    .replace(/["\(\)\*\-\+\:\^]/g, " ")
    .trim()
    .split(/\s+/)
    .filter((term) => term.length >= 2) // Skip single chars
    .map((term) => `"${term}"`) // Quote each term for exact match
    .join(" OR ");

  return cleaned;
}

function determineMatchType(
  titleMatch: string,
  entityMatch: string
): "title" | "entity" | "both" {
  const titleHasMatch = titleMatch?.includes("<b>");
  const entityHasMatch = entityMatch?.includes("<b>");

  if (titleHasMatch && entityHasMatch) return "both";
  if (titleHasMatch) return "title";
  return "entity";
}

// =============================================================================
// Hybrid Search (RRF Fusion)
// =============================================================================

export interface HybridSearchResult {
  memoryId: string;
  score: number;
  vectorScore?: number;
  bm25Score?: number;
  vectorRank?: number;
  bm25Rank?: number;
}

/**
 * Reciprocal Rank Fusion (RRF) for combining ranked lists
 * 
 * RRF Score = Σ 1/(k + rank)
 * where k=60 is a constant that balances top ranks vs lower ranks
 */
export function rrfFusion(
  vectorResults: Array<{ id: string; score: number }>,
  bm25Results: Array<{ memoryId: string; score: number }>,
  options: {
    k?: number;
    vectorWeight?: number;
    bm25Weight?: number;
    topRankBonus?: number;
  } = {}
): HybridSearchResult[] {
  const k = options.k ?? 60;
  const vectorWeight = options.vectorWeight ?? 1.0;
  const bm25Weight = options.bm25Weight ?? 1.0;
  const topRankBonus = options.topRankBonus ?? 0.05;

  const scores = new Map<string, HybridSearchResult>();

  // Process vector results
  vectorResults.forEach((result, index) => {
    const rank = index + 1;
    const rrfScore = vectorWeight / (k + rank);
    const bonus = rank === 1 ? topRankBonus : rank <= 3 ? topRankBonus * 0.4 : 0;

    const existing = scores.get(result.id) ?? {
      memoryId: result.id,
      score: 0,
    };

    existing.score += rrfScore + bonus;
    existing.vectorScore = result.score;
    existing.vectorRank = rank;
    scores.set(result.id, existing);
  });

  // Process BM25 results
  bm25Results.forEach((result, index) => {
    const rank = index + 1;
    const rrfScore = bm25Weight / (k + rank);
    const bonus = rank === 1 ? topRankBonus : rank <= 3 ? topRankBonus * 0.4 : 0;

    const existing = scores.get(result.memoryId) ?? {
      memoryId: result.memoryId,
      score: 0,
    };

    existing.score += rrfScore + bonus;
    existing.bm25Score = result.score;
    existing.bm25Rank = rank;
    scores.set(result.memoryId, existing);
  });

  // Sort by combined RRF score
  return Array.from(scores.values()).sort((a, b) => b.score - a.score);
}

// =============================================================================
// FTS Status
// =============================================================================

export async function getFtsStats(userId: string): Promise<{
  indexed: number;
  tableExists: boolean;
}> {
  const client = getDb();

  try {
    const result = await client.execute({
      sql: "SELECT COUNT(*) as count FROM memories_fts WHERE user_id = ?",
      args: [userId],
    });
    return {
      indexed: (result.rows[0]?.count as number) ?? 0,
      tableExists: true,
    };
  } catch {
    return { indexed: 0, tableExists: false };
  }
}
