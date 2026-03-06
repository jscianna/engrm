#!/usr/bin/env npx ts-node
/**
 * Re-scan all memories for secrets and update sensitive flag
 */

import { createClient } from "@libsql/client";
import crypto from "node:crypto";

const ENCRYPTION_ALGORITHM = "aes-256-gcm";

function getMasterKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) throw new Error("ENCRYPTION_KEY required");
  const trimmed = raw.trim();
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    return Buffer.from(trimmed, "hex");
  }
  return crypto.createHash("sha256").update(trimmed, "utf8").digest();
}

function deriveUserKey(userId: string): Buffer {
  const master = getMasterKey();
  return crypto.createHash("sha256").update(Buffer.concat([master, Buffer.from(userId, "utf8")])).digest();
}

function decryptMemoryContent(encryptedJson: string, userId: string): string {
  try {
    const payload = JSON.parse(encryptedJson) as { ciphertext: string; iv: string };
    const key = deriveUserKey(userId);
    const [ciphertextB64, authTagB64] = payload.ciphertext.split(".");
    if (!ciphertextB64 || !authTagB64) throw new Error("Invalid format");
    const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, key, Buffer.from(payload.iv, "base64"));
    decipher.setAuthTag(Buffer.from(authTagB64, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(ciphertextB64, "base64")), decipher.final()]).toString("utf8");
  } catch {
    return encryptedJson; // Return as-is if not encrypted
  }
}

// Secret patterns from secrets.ts
const SECRET_PATTERNS = [
  /\bmem_[a-zA-Z0-9]{30,}/g,
  /\bsk-[a-zA-Z0-9]{32,}/g,
  /\bghp_[a-zA-Z0-9]{36,}/g,
  /\beyJ[a-zA-Z0-9_-]{20,}\.eyJ[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,}/g,
  /password\s*[:=\-]\s*["']?[^\s"']{6,}["']?/gi,
  /api\s*key\s*[:=\-]\s*["']?[^\s"']{10,}["']?/gi,
  /secret\s*[:=\-]\s*["']?[^\s"']{10,}["']?/gi,
  /token\s*[:=\-]\s*["']?[^\s"']{16,}["']?/gi,
  /\bATTA[a-zA-Z0-9]{40,}/g, // Trello token
  /\b[0-9a-f]{32}\b/g, // Generic 32-char hex (API keys)
];

function containsSecrets(text: string): boolean {
  for (const pattern of SECRET_PATTERNS) {
    pattern.lastIndex = 0;
    if (pattern.test(text)) return true;
  }
  return false;
}

async function main() {
  const userId = process.argv[2] || "user_39b7Bzrd5LLE2qQspDj0uSlM0lZ";
  
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;
  if (!url) { console.error("TURSO_DATABASE_URL required"); process.exit(1); }

  const client = createClient({ url, authToken });
  
  const result = await client.execute({
    sql: "SELECT id, user_id, content_text, sensitive FROM memories WHERE user_id = ?",
    args: [userId],
  });
  
  console.log(`Scanning ${result.rows.length} memories...`);
  
  let flagged = 0;
  let alreadyFlagged = 0;
  
  for (const row of result.rows) {
    const r = row as Record<string, unknown>;
    const content = decryptMemoryContent(r.content_text as string, r.user_id as string);
    const hasSecrets = containsSecrets(content);
    const currentFlag = Number(r.sensitive ?? 0);
    
    if (hasSecrets && currentFlag === 0) {
      await client.execute({
        sql: "UPDATE memories SET sensitive = 1 WHERE id = ?",
        args: [r.id as string],
      });
      flagged++;
      console.log(`  Flagged: ${String(r.id).slice(0, 8)}...`);
    } else if (hasSecrets) {
      alreadyFlagged++;
    }
  }
  
  console.log(`\n✓ Done. Newly flagged: ${flagged}, Already flagged: ${alreadyFlagged}`);
  client.close();
}

main().catch(console.error);
