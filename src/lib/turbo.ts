import { TurboFactory, type ArweaveJWK, type TokenType } from "@ardrive/turbo-sdk";

const token = (process.env.TURBO_TOKEN as TokenType | undefined) ?? "arweave";

function getArweaveKey(): ArweaveJWK | null {
  const raw = process.env.ARWEAVE_JWK;
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as ArweaveJWK;
  } catch {
    throw new Error("ARWEAVE_JWK is not valid JSON");
  }
}

export async function uploadTextToArweave({
  title,
  content,
  sourceType,
}: {
  title: string;
  content: string;
  sourceType: "text" | "url" | "file";
}): Promise<string | null> {
  const privateKey = getArweaveKey();

  if (!privateKey) {
    return null;
  }

  const turbo = TurboFactory.authenticated({
    privateKey,
    token,
  });

  const response = await turbo.upload({
    data: Buffer.from(content, "utf8"),
    dataItemOpts: {
      tags: [
        { name: "App-Name", value: "MEMRY" },
        { name: "Content-Type", value: "text/plain; charset=utf-8" },
        { name: "Memory-Title", value: title.slice(0, 120) },
        { name: "Memory-Type", value: sourceType },
      ],
    },
  });

  return response.id;
}
