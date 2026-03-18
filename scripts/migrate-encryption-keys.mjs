#!/usr/bin/env node
/**
 * One-shot migration: re-encrypt all memories from SHA-256 to HKDF key derivation.
 *
 * Usage:
 *   ENCRYPTION_KEY=<your-key> TURSO_DATABASE_URL=<url> TURSO_AUTH_TOKEN=<token> node scripts/migrate-encryption-keys.mjs
 *
 * Add --dry-run to preview without writing.
 */

import crypto from "node:crypto";
import { createClient } from "@libsql/client";

const DRY_RUN = process.argv.includes("--dry-run");

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
const TURSO_DATABASE_URL = process.env.TURSO_DATABASE_URL;
const TURSO_AUTH_TOKEN = process.env.TURSO_AUTH_TOKEN;

if (!ENCRYPTION_KEY || !TURSO_DATABASE_URL) {
  console.error("Missing ENCRYPTION_KEY or TURSO_DATABASE_URL");
  process.exit(1);
}

const db = createClient({
  url: TURSO_DATABASE_URL,
  authToken: TURSO_AUTH_TOKEN,
});

function getMasterKey() {
  if (/^[0-9a-f]{64}$/i.test(ENCRYPTION_KEY)) {
    return Buffer.from(ENCRYPTION_KEY, "hex");
  }
  const buf = Buffer.from(ENCRYPTION_KEY, "base64");
  if (buf.length === 32) return buf;
  throw new Error("Invalid ENCRYPTION_KEY format");
}

const master = getMasterKey();

function deriveKeyLegacy(userId) {
  return crypto.createHash("sha256").update(Buffer.concat([master, Buffer.from(userId, "utf8")])).digest();
}

function deriveKeyHKDF(userId) {
  return Buffer.from(crypto.hkdfSync("sha256", master, Buffer.alloc(0), `fathippo:memory:${userId}`, 32));
}

function decryptAesGcm(payload, key) {
  const [ctB64, tagB64] = payload.ciphertext.split(".");
  const ct = Buffer.from(ctB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const iv = Buffer.from(payload.iv, "base64");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]);
}

function encryptAesGcm(plaintext, key) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    ciphertext: `${ct.toString("base64")}.${tag.toString("base64")}`,
    iv: iv.toString("base64"),
  };
}

async function main() {
  const result = await db.execute(
    "SELECT id, user_id, content_text, content_iv, content_encrypted FROM memories WHERE content_encrypted = 1"
  );

  console.log(`Found ${result.rows.length} encrypted memories`);
  if (DRY_RUN) console.log("DRY RUN — no writes");

  let migrated = 0;
  let failed = 0;

  for (const row of result.rows) {
    const { id, user_id, content_text } = row;
    try {
      // Decrypt with old SHA-256 key
      const old_key = deriveKeyLegacy(user_id);
      const payload = JSON.parse(content_text);
      const plaintext = decryptAesGcm(payload, old_key);

      // Re-encrypt with new HKDF key
      const new_key = deriveKeyHKDF(user_id);
      const new_encrypted = encryptAesGcm(plaintext, new_key);
      const new_content = JSON.stringify(new_encrypted);
      const new_hash = crypto.createHash("sha256").update(plaintext).digest("hex");

      if (!DRY_RUN) {
        await db.execute({
          sql: "UPDATE memories SET content_text = ?, content_hash = ? WHERE id = ? AND user_id = ?",
          args: [new_content, new_hash, id, user_id],
        });
      }

      migrated++;
      if (migrated % 50 === 0) console.log(`  migrated ${migrated}...`);
    } catch (e) {
      console.error(`  FAILED ${id}: ${e.message}`);
      failed++;
    }
  }

  console.log(`\nDone. Migrated: ${migrated}, Failed: ${failed}`);
  if (DRY_RUN) console.log("(dry run — nothing was written)");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
