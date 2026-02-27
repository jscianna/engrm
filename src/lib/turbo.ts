import { TurboFactory, type ArweaveJWK, type TokenType } from "@ardrive/turbo-sdk";
import type { MemoryKind } from "@/lib/types";

export const turboToken = (process.env.TURBO_TOKEN as TokenType | undefined) ?? "arweave";

export function parseArweaveJwk(raw: string): ArweaveJWK {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new Error("Arweave JWK is not valid JSON");
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error("Arweave JWK must be a JSON object");
  }

  const jwk = parsed as Record<string, unknown>;
  if (jwk.kty !== "RSA") {
    throw new Error("Arweave JWK must use RSA keys");
  }
  for (const key of ["n", "e", "d"] as const) {
    if (typeof jwk[key] !== "string" || jwk[key].length === 0) {
      throw new Error(`Arweave JWK is missing required RSA field: ${key}`);
    }
  }

  return jwk as unknown as ArweaveJWK;
}

export function getArweaveKeyFromEnv(): ArweaveJWK | null {
  const raw = process.env.ARWEAVE_JWK;
  if (!raw) {
    return null;
  }
  return parseArweaveJwk(raw);
}

export async function uploadTextToArweave({
  title,
  content,
  sourceType,
  memoryType,
  importance,
  tags,
  jwk,
  encryptedContent,
  iv,
}: {
  title: string;
  content: string;
  sourceType: "text" | "url" | "file";
  memoryType: MemoryKind;
  importance: number;
  tags: string[];
  jwk?: ArweaveJWK | null;
  encryptedContent?: string;
  iv?: string;
}): Promise<string | null> {
  const privateKey = jwk ?? getArweaveKeyFromEnv();

  // Wallet required to sign data items - free subsidy covers upload cost but not signing
  if (!privateKey) {
    return null;
  }

  const turbo = TurboFactory.authenticated({ privateKey, token: turboToken });

  const hasEncryptedPayload = Boolean(encryptedContent && iv);
  const uploadContent = hasEncryptedPayload
    ? JSON.stringify({
        encrypted: true,
        iv,
        data: encryptedContent,
      })
    : content;

  const response = await turbo.upload({
    data: Buffer.from(uploadContent, "utf8"),
    dataItemOpts: {
      tags: [
        { name: "App-Name", value: "MEMRY" },
        { name: "Content-Type", value: hasEncryptedPayload ? "application/json; charset=utf-8" : "text/plain; charset=utf-8" },
        { name: "Memory-Title", value: title.slice(0, 120) },
        { name: "Memory-Source-Type", value: sourceType },
        { name: "Memory-Type", value: memoryType },
        { name: "Memory-Importance", value: String(importance) },
        { name: "Memory-Tags", value: tags.join(",").slice(0, 240) },
        ...(hasEncryptedPayload
          ? [
              { name: "encrypted", value: "true" },
              { name: "iv", value: iv as string },
            ]
          : []),
      ],
    },
  });

  return response.id;
}
