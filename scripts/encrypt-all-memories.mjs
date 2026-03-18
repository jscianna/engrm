#!/usr/bin/env node
/**
 * One-shot: encrypt all unencrypted memories in-place.
 *
 * Usage:
 *   cd ~/clawd/projects/fathippo
 *   source <(grep -E "^(ENCRYPTION_KEY|TURSO_DATABASE_URL|TURSO_AUTH_TOKEN)=" .env.local | sed 's/^/export /')
 *   node scripts/encrypt-all-memories.mjs --dry-run
 *   node scripts/encrypt-all-memories.mjs
 */

import crypto from "node:crypto";
import { createClient } from "@libsql/client";

const DRY_RUN = process.argv.includes("--dry-run");
const { ENCRYPTION_KEY, TURSO_DATABASE_URL, TURSO_AUTH_TOKEN } = process.env;

if (!ENCRYPTION_KEY || !TURSO_DATABASE_URL) {
  console.error("Missing ENCRYPTION_KEY or TURSO_DATABASE_URL");
  process.exit(1);
}

const db = createClient({ url: TURSO_DATABASE_URL, authToken: TURSO_AUTH_TOKEN });

function getMasterKey() {
  if (/^[0-9a-f]{64}$/i.test(ENCRYPTION_KEY)) return Buffer.from(ENCRYPTION_KEY, "hex");
  const buf = Buffer.from(ENCRYPTION_KEY, "base64");
  if (buf.length === 32) return buf;
  throw new Error("Invalid ENCRYPTION_KEY format");
}

const master = getMasterKey();

function deriveKey(userId) {
  return Buffer.from(crypto.hkdfSync("sha256", master, Buffer.alloc(0), `fathippo:memory:${userId}`, 32));
}

function encrypt(plaintext, userId) {
  const key = deriveKey(userId);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(Buffer.from(plaintext, "utf8")), cipher.final()]);
  const tag = cipher.getAuthTag();
  return JSON.stringify({
    ciphertext: `${ct.toString("base64")}.${tag.toString("base64")}`,
    iv: iv.toString("base64"),
  });
}

async function main() {
  const result = await db.execute(
    "SELECT id, user_id, content_text FROM memories WHERE content_encrypted = 0"
  );

  console.log(`Found ${result.rows.length} unencrypted memories`);
  if (DRY_RUN) console.log("DRY RUN — no writes\n");

  let done = 0, failed = 0;

  for (const row of result.rows) {
    try {
      const encrypted = encrypt(row.content_text, row.user_id);
      const hash = crypto.createHash("sha256").update(row.content_text, "utf8").digest("hex");

      if (!DRY_RUN) {
        await db.execute({
          sql: "UPDATE memories SET content_text = ?, content_hash = ?, content_encrypted = 1 WHERE id = ? AND user_id = ?",
          args: [encrypted, hash, row.id, row.user_id],
        });
      }
      done++;
      if (done % 100 === 0) console.log(`  ${done}/${result.rows.length}...`);
    } catch (e) {
      console.error(`  FAILED ${row.id}: ${e.message}`);
      failed++;
    }
  }

  console.log(`\nDone. Encrypted: ${done}, Failed: ${failed}`);
  if (DRY_RUN) console.log("(dry run — nothing written)");
}

main().catch((e) => { console.error(e); process.exit(1); });
