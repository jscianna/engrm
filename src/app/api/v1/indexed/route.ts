/**
 * Indexed Memory API (Memex-style)
 * 
 * Stores memories with stable indices for precise dereferencing.
 * Agent context gets compact summaries; full content retrieved on demand.
 * 
 * POST /api/v1/indexed - Store indexed memory
 * GET /api/v1/indexed - List indexed summaries (compact)
 */

import { validateApiKey } from "@/lib/api-auth";
import { FatHippoError, errorResponse } from "@/lib/errors";
import { getDb } from "@/lib/turso";
import { embedText } from "@/lib/embeddings";

export const runtime = "nodejs";

// Ensure indexed_memories table exists
async function ensureIndexedTable() {
  const client = getDb();
  
  await client.execute(`
    CREATE TABLE IF NOT EXISTS indexed_memories (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      index_key TEXT NOT NULL,
      summary TEXT NOT NULL,
      full_content TEXT NOT NULL,
      content_type TEXT DEFAULT 'text',
      metadata_json TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      access_count INTEGER DEFAULT 0,
      last_accessed_at TEXT,
      UNIQUE(user_id, index_key)
    )
  `);
  
  await client.execute(`
    CREATE INDEX IF NOT EXISTS idx_indexed_memories_user_key
    ON indexed_memories(user_id, index_key)
  `);
}

/**
 * POST /api/v1/indexed
 * Store a new indexed memory or update existing
 */
export async function POST(request: Request) {
  try {
    const identity = await validateApiKey(request, "indexed.create");
    const body = await request.json();
    
    const indexKey = typeof body.index === "string" ? body.index.trim() : null;
    const summary = typeof body.summary === "string" ? body.summary.trim() : null;
    const fullContent = typeof body.content === "string" ? body.content.trim() : null;
    const contentType = typeof body.contentType === "string" ? body.contentType : "text";
    const metadata = body.metadata || null;
    
    if (!indexKey) {
      throw new FatHippoError("VALIDATION_ERROR", { field: "index", reason: "required" });
    }
    if (!summary) {
      throw new FatHippoError("VALIDATION_ERROR", { field: "summary", reason: "required" });
    }
    if (!fullContent) {
      throw new FatHippoError("VALIDATION_ERROR", { field: "content", reason: "required" });
    }
    
    // Validate index key format (alphanumeric, hyphens, underscores)
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(indexKey)) {
      throw new FatHippoError("VALIDATION_ERROR", { 
        field: "index", 
        reason: "must be 1-64 alphanumeric characters, hyphens, or underscores" 
      });
    }
    
    await ensureIndexedTable();
    const client = getDb();
    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    
    // Upsert: update if exists, insert if not
    await client.execute({
      sql: `
        INSERT INTO indexed_memories (id, user_id, index_key, summary, full_content, content_type, metadata_json, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id, index_key) DO UPDATE SET
          summary = excluded.summary,
          full_content = excluded.full_content,
          content_type = excluded.content_type,
          metadata_json = excluded.metadata_json,
          updated_at = excluded.updated_at
      `,
      args: [
        id,
        identity.userId,
        indexKey,
        summary,
        fullContent,
        contentType,
        metadata ? JSON.stringify(metadata) : null,
        now,
        now,
      ],
    });
    
    // Also store in regular memories for semantic search (summary only)
    // This allows both indexed access AND similarity search
    try {
      const embedding = await embedText(summary);
      // Store with reference to index
      await client.execute({
        sql: `
          INSERT INTO memories (id, user_id, title, content_text, content_hash, source_type, memory_type, importance_tier, created_at, metadata_json)
          VALUES (?, ?, ?, ?, ?, 'indexed', 'fact', 'normal', ?, ?)
          ON CONFLICT DO NOTHING
        `,
        args: [
          `idx-${indexKey}-${identity.userId.slice(-8)}`,
          identity.userId,
          `[${indexKey}] ${summary.slice(0, 60)}`,
          summary,
          `idx:${indexKey}`,
          now,
          JSON.stringify({ indexedMemoryKey: indexKey }),
        ],
      });
    } catch {
      // Best effort - don't fail if embedding fails
    }
    
    return Response.json({
      stored: true,
      index: indexKey,
      summary: summary.slice(0, 100) + (summary.length > 100 ? "..." : ""),
    }, { status: 201 });
    
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * GET /api/v1/indexed
 * List all indexed summaries (compact, for agent context)
 */
export async function GET(request: Request) {
  try {
    const identity = await validateApiKey(request, "indexed.list");
    
    await ensureIndexedTable();
    const client = getDb();
    
    const result = await client.execute({
      sql: `
        SELECT index_key, summary, content_type, created_at, updated_at, access_count
        FROM indexed_memories
        WHERE user_id = ?
        ORDER BY updated_at DESC
        LIMIT 100
      `,
      args: [identity.userId],
    });
    
    const indices = result.rows.map((row) => ({
      index: row.index_key,
      summary: row.summary,
      contentType: row.content_type,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      accessCount: row.access_count,
    }));
    
    // Format for agent context (compact)
    const contextFormat = indices.map(i => `[${i.index}]: ${i.summary}`).join("\n");
    
    return Response.json({
      indices,
      contextFormat,
      count: indices.length,
    });
    
  } catch (error) {
    return errorResponse(error);
  }
}
