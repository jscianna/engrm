/**
 * Temporary diagnostic endpoint — remove after debugging.
 * Checks if the production ENCRYPTION_KEY can decrypt memories.
 */
import crypto from "node:crypto";
import { validateApiKey } from "@/lib/api-auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const identity = await validateApiKey(request, "simple.recall");
    
    const raw = process.env.ENCRYPTION_KEY ?? "";
    const trimmed = raw.trim();
    const isHex64 = /^[0-9a-fA-F]{64}$/.test(trimmed);
    const master = isHex64 ? Buffer.from(trimmed, "hex") : null;
    
    let hkdfFirst4 = "n/a";
    if (master) {
      const derived = Buffer.from(
        crypto.hkdfSync("sha256", master, Buffer.alloc(0), `fathippo:memory:${identity.userId}`, 32)
      );
      hkdfFirst4 = derived.subarray(0, 4).toString("hex");
    }

    return Response.json({
      keyLength: trimmed.length,
      isValidHex64: isHex64,
      keyPrefix: trimmed.slice(0, 8),
      keySuffix: trimmed.slice(-4),
      hkdfFirst4Bytes: hkdfFirst4,
      userId: identity.userId,
      nodeVersion: process.version,
    });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
