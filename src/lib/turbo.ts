import { TurboFactory, type ArweaveJWK, type TokenType } from "@ardrive/turbo-sdk";

export const turboToken = (process.env.TURBO_TOKEN as TokenType | undefined) ?? "arweave";

export function parseArweaveJwk(raw: string): ArweaveJWK {
  try {
    return JSON.parse(raw) as ArweaveJWK;
  } catch {
    throw new Error("Arweave JWK is not valid JSON");
  }
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
}: {
  title: string;
  content: string;
  sourceType: "text" | "url" | "file";
  memoryType: "episodic" | "semantic" | "procedural" | "self-model";
  importance: number;
  tags: string[];
  jwk?: ArweaveJWK | null;
}): Promise<string | null> {
  const privateKey = jwk ?? getArweaveKeyFromEnv();

  if (!privateKey) {
    return null;
  }

  const turbo = TurboFactory.authenticated({
    privateKey,
    token: turboToken,
  });

  const response = await turbo.upload({
    data: Buffer.from(content, "utf8"),
    dataItemOpts: {
      tags: [
        { name: "App-Name", value: "MEMRY" },
        { name: "Content-Type", value: "text/plain; charset=utf-8" },
        { name: "Memory-Title", value: title.slice(0, 120) },
        { name: "Memory-Source-Type", value: sourceType },
        { name: "Memory-Type", value: memoryType },
        { name: "Memory-Importance", value: String(importance) },
        { name: "Memory-Tags", value: tags.join(",").slice(0, 240) },
      ],
    },
  });

  return response.id;
}
