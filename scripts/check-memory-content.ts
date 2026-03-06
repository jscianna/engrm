import { createClient } from "@libsql/client";
import * as nodeCrypto from "node:crypto";

const ENCRYPTION_ALGORITHM = "aes-256-gcm";

function getMasterKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) throw new Error("ENCRYPTION_KEY required");
  const trimmed = raw.trim();
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) return Buffer.from(trimmed, "hex");
  return nodeCrypto.createHash("sha256").update(trimmed, "utf8").digest();
}

function deriveUserKey(userId: string): Buffer {
  return nodeCrypto.createHash("sha256").update(Buffer.concat([getMasterKey(), Buffer.from(userId, "utf8")])).digest();
}

function decrypt(encryptedJson: string, userId: string): string {
  try {
    const p = JSON.parse(encryptedJson) as { ciphertext: string; iv: string };
    const key = deriveUserKey(userId);
    const [ct, tag] = p.ciphertext.split(".");
    const d = nodeCrypto.createDecipheriv(ENCRYPTION_ALGORITHM, key, Buffer.from(p.iv, "base64"));
    d.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([d.update(Buffer.from(ct, "base64")), d.final()]).toString("utf8");
  } catch {
    return encryptedJson;
  }
}

async function main() {
  const client = createClient({ 
    url: process.env.TURSO_DATABASE_URL!, 
    authToken: process.env.TURSO_AUTH_TOKEN 
  });
  
  const r = await client.execute({
    sql: `SELECT id, title, content_text, user_id, sensitive FROM memories WHERE user_id = 'user_39b7Bzrd5LLE2qQspDj0uSlM0lZ'`,
    args: []
  });
  
  console.log(`Checking ${r.rows.length} memories for credential patterns...\n`);
  
  for (const row of r.rows) {
    const m = row as Record<string, unknown>;
    const decrypted = decrypt(m.content_text as string, m.user_id as string);
    
    // Look for john@ or API key or pw: patterns
    if (decrypted.includes("john@") || decrypted.includes("API key") || 
        (decrypted.toLowerCase().includes("pw") && decrypted.includes(":"))) {
      console.log(`Title: ${(m.title as string).substring(0, 60)}`);
      console.log(`Sensitive: ${m.sensitive}`);
      console.log(`Content: ${decrypted.substring(0, 500)}`);
      console.log("---");
    }
  }
  
  client.close();
}

main().catch(console.error);
