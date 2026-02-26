import { NextResponse } from "next/server";
import { createClient } from "@libsql/client";

export const runtime = "nodejs";

/**
 * Migration endpoint to ensure all tables exist
 * GET /api/migrate?key=xxx
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const key = url.searchParams.get("key");
  
  // Simple protection - require a key (use "migrate-memry-2026" or first 20 chars of CLERK_SECRET_KEY)
  const validKey = key === "migrate-memry-2026" || key === process.env.CLERK_SECRET_KEY?.slice(0, 20);
  if (!validKey) {
    return NextResponse.json({ error: "Invalid key. Use ?key=migrate-memry-2026" }, { status: 401 });
  }

  const db = createClient({
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN,
  });
  
  const migrations: string[] = [];

  try {
    // Add missing columns to memories table
    try {
      await db.execute(`ALTER TABLE memories ADD COLUMN namespace_id TEXT`);
      migrations.push("Added namespace_id column to memories");
    } catch {
      migrations.push("namespace_id column already exists or table missing");
    }

    try {
      await db.execute(`ALTER TABLE memories ADD COLUMN session_id TEXT`);
      migrations.push("Added session_id column to memories");
    } catch {
      migrations.push("session_id column already exists");
    }

    // Check and create api_keys table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS api_keys (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        key_hash TEXT NOT NULL UNIQUE,
        agent_id TEXT NOT NULL,
        agent_name TEXT,
        created_at TEXT NOT NULL,
        last_used TEXT
      )
    `);
    migrations.push("api_keys table ensured");

    await db.execute(`
      CREATE INDEX IF NOT EXISTS idx_api_keys_user_created_at
      ON api_keys(user_id, created_at DESC)
    `);
    migrations.push("api_keys index ensured");

    // Check and create memory_edges table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS memory_edges (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        source_id TEXT NOT NULL,
        target_id TEXT NOT NULL,
        relationship_type TEXT NOT NULL,
        weight REAL DEFAULT 1.0,
        metadata_json TEXT,
        created_at TEXT NOT NULL,
        UNIQUE(source_id, target_id, relationship_type)
      )
    `);
    migrations.push("memory_edges table ensured");

    await db.execute(`
      CREATE INDEX IF NOT EXISTS idx_edges_user ON memory_edges(user_id)
    `);
    await db.execute(`
      CREATE INDEX IF NOT EXISTS idx_edges_source ON memory_edges(source_id)
    `);
    await db.execute(`
      CREATE INDEX IF NOT EXISTS idx_edges_target ON memory_edges(target_id)
    `);
    migrations.push("memory_edges indexes ensured");

    // Namespaces table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS namespaces (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        created_at TEXT NOT NULL,
        UNIQUE(user_id, name)
      )
    `);
    migrations.push("namespaces table ensured");

    // Sessions table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        name TEXT,
        namespace_id TEXT,
        metadata_json TEXT,
        created_at TEXT NOT NULL,
        last_active_at TEXT NOT NULL
      )
    `);
    migrations.push("sessions table ensured");

    // Verify tables
    const tables = await db.execute("SELECT name FROM sqlite_master WHERE type='table'");
    const tableNames = tables.rows.map(r => r.name as string);

    return NextResponse.json({
      success: true,
      migrations,
      tables: tableNames,
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      migrations,
    }, { status: 500 });
  }
}
