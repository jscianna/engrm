/**
 * Temporary diagnostic endpoint — remove after debugging.
 * Tries to actually decrypt a memory in production.
 */
import crypto from "node:crypto";
import { validateApiKey } from "@/lib/api-auth";
import { decryptMemoryContent } from "@/lib/db";
import { createClient } from "@libsql/client";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const identity = await validateApiKey(request, "simple.recall");
    
    const raw = process.env.ENCRYPTION_KEY ?? "";
    const trimmed = raw.trim();
    const master = Buffer.from(trimmed, "hex");
    const userKey = Buffer.from(
      crypto.hkdfSync("sha256", master, Buffer.alloc(0), `fathippo:memory:${identity.userId}`, 32)
    );

    // Direct DB connection to bypass any caching
    const db = createClient({
      url: process.env.TURSO_DATABASE_URL!,
      authToken: process.env.TURSO_AUTH_TOKEN,
    });

    const result = await db.execute({
      sql: "SELECT id, content_text, content_encrypted FROM memories WHERE user_id = ? AND content_encrypted = 1 LIMIT 1",
      args: [identity.userId],
    });

    if (result.rows.length === 0) {
      return Response.json({ error: "No encrypted memories found" });
    }

    const row = result.rows[0];
    const stored = row.content_text as string;
    
    // Try raw crypto first
    let rawDecrypt = "not attempted";
    let appDecrypt = "not attempted";
    let payload: { ciphertext: string; iv: string } | null = null;
    
    try {
      payload = JSON.parse(stored);
      const [ctB64, tagB64] = payload!.ciphertext.split(".");
      const ct = Buffer.from(ctB64, "base64");
      const tag = Buffer.from(tagB64, "base64");
      const iv = Buffer.from(payload!.iv, "base64");
      
      const decipher = crypto.createDecipheriv("aes-256-gcm", userKey, iv);
      decipher.setAuthTag(tag);
      const plain = Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
      rawDecrypt = `OK: ${plain.slice(0, 60)}`;
    } catch (e) {
      rawDecrypt = `FAILED: ${e}`;
    }

    // Try via app's decryptMemoryContent
    try {
      const result = decryptMemoryContent(stored, identity.userId);
      appDecrypt = `OK: ${result.slice(0, 60)}`;
    } catch (e) {
      appDecrypt = `FAILED: ${e}`;
    }

    return Response.json({
      memoryId: row.id,
      userId: identity.userId,
      keyPrefix: trimmed.slice(0, 8),
      hkdfFirst4: userKey.subarray(0, 4).toString("hex"),
      ciphertextLen: payload?.ciphertext?.length ?? 0,
      ivLen: payload?.iv?.length ?? 0,
      rawDecrypt,
      appDecrypt,
      nodeVersion: process.version,
    });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
