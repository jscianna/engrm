import crypto from "node:crypto";

export function hashContent(content: string): string {
  return crypto.createHash("sha256").update(content, "utf8").digest("hex");
}

export function cleanText(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

export async function extractUrlContent(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "MEMRYBot/0.1",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch URL: ${response.status}`);
  }

  const html = await response.text();
  const noScripts = html.replace(/<script[\s\S]*?<\/script>/gi, " ");
  const noStyles = noScripts.replace(/<style[\s\S]*?<\/style>/gi, " ");
  const textOnly = noStyles.replace(/<[^>]+>/g, " ");

  return cleanText(textOnly);
}
