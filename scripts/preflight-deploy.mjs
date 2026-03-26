#!/usr/bin/env node
import { createClient } from "@libsql/client";

const errors = [];
const warnings = [];

function ok(msg) {
  console.log(`✅ ${msg}`);
}

function fail(msg) {
  errors.push(msg);
  console.error(`❌ ${msg}`);
}

function warn(msg) {
  warnings.push(msg);
  console.warn(`⚠️  ${msg}`);
}

function parseCanonicalBase64Key(raw) {
  try {
    const trimmed = raw.trim();
    const bytes = Buffer.from(trimmed, "base64");
    if (bytes.length !== 32) return null;
    const canonical = bytes.toString("base64");
    return canonical === trimmed ? bytes : null;
  } catch {
    return null;
  }
}

function validateEncryptionKey() {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw || raw.trim().length === 0) {
    fail("ENCRYPTION_KEY is missing");
    return;
  }

  const trimmed = raw.trim();
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    ok("ENCRYPTION_KEY format is valid 64-char hex");
    return;
  }

  if (parseCanonicalBase64Key(trimmed)) {
    ok("ENCRYPTION_KEY format is valid canonical 32-byte base64");
    return;
  }

  fail("ENCRYPTION_KEY must be 64-char hex or canonical 32-byte base64");
}

function validateTursoUrl() {
  const url = process.env.TURSO_DATABASE_URL;
  if (!url || url.trim().length === 0) {
    fail("TURSO_DATABASE_URL is missing");
    return;
  }

  if (!url.startsWith("libsql://") && !url.startsWith("file:")) {
    fail("TURSO_DATABASE_URL must start with libsql:// (or file: for local)");
  } else {
    ok(`TURSO_DATABASE_URL format looks valid (${url})`);
  }

  const expected = process.env.EXPECTED_TURSO_DATABASE_URL;
  if (expected && expected.trim() && expected.trim() !== url.trim()) {
    fail(`TURSO_DATABASE_URL mismatch: expected ${expected.trim()} but got ${url.trim()}`);
  }
}

async function validateSchema() {
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;

  if (!url) {
    fail("Cannot run schema preflight without TURSO_DATABASE_URL");
    return;
  }

  if (!authToken && !url.startsWith("file:")) {
    fail("Cannot run schema preflight without TURSO_AUTH_TOKEN");
    return;
  }

  const client = createClient({
    url,
    authToken,
  });

  const requiredColumns = [
    "id",
    "user_id",
    "content_text",
    "content_encrypted",
    "content_hash",
    "peer",
  ];

  const requiredIndexes = [
    "idx_memories_user_peer",
    "idx_memories_user_namespace_created_at",
  ];

  try {
    const tableInfo = await client.execute("PRAGMA table_info(memories)");
    const columns = new Set(
      tableInfo.rows
        .map((row) => (typeof row.name === "string" ? row.name : null))
        .filter(Boolean),
    );

    for (const col of requiredColumns) {
      if (!columns.has(col)) {
        fail(`Schema missing required column: memories.${col}`);
      }
    }

    if (requiredColumns.every((c) => columns.has(c))) {
      ok("Required memories columns present");
    }

    const indexInfo = await client.execute("PRAGMA index_list(memories)");
    const indexes = new Set(
      indexInfo.rows
        .map((row) => (typeof row.name === "string" ? row.name : null))
        .filter(Boolean),
    );

    for (const idx of requiredIndexes) {
      if (!indexes.has(idx)) {
        fail(`Schema missing required index: ${idx}`);
      }
    }

    if (requiredIndexes.every((i) => indexes.has(i))) {
      ok("Required memories indexes present");
    }
  } catch (err) {
    fail(`Schema preflight query failed: ${err?.message ?? String(err)}`);
  }
}

async function main() {
  console.log("🔎 Running deploy preflight checks...\n");

  validateEncryptionKey();
  validateTursoUrl();

  if (process.env.ENABLE_DIAGNOSTICS === "true") {
    warn("ENABLE_DIAGNOSTICS is set to true — disable before production deploy");
  }

  await validateSchema();

  console.log("\n--- Preflight Summary ---");
  if (warnings.length > 0) {
    console.log(`Warnings: ${warnings.length}`);
  }

  if (errors.length > 0) {
    console.error(`Failed checks: ${errors.length}`);
    process.exit(1);
  }

  console.log("All preflight checks passed ✅");
}

main().catch((err) => {
  console.error("Preflight crashed:", err);
  process.exit(1);
});
