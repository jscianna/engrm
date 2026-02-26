import crypto from "node:crypto";
import dns from "node:dns/promises";
import net from "node:net";

const FETCH_TIMEOUT_MS = 10_000;
const MAX_FETCH_BYTES = 5 * 1024 * 1024;

export function hashContent(content: string): string {
  return crypto.createHash("sha256").update(content, "utf8").digest("hex");
}

export function cleanText(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

function isBlockedIp(ip: string): boolean {
  const family = net.isIP(ip);
  if (family === 4) {
    const [a, b] = ip.split(".").map((value) => Number(value));
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    return false;
  }

  if (family === 6) {
    const lower = ip.toLowerCase();
    if (lower === "::1") return true;
    if (lower.startsWith("fe80:")) return true;
    if (lower.startsWith("fc") || lower.startsWith("fd")) return true;
    return false;
  }

  return true;
}

async function validateUrlTarget(rawUrl: string): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error("Invalid URL");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Only http(s) URLs are allowed.");
  }

  const hostname = parsed.hostname.toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".localhost")) {
    throw new Error("Private hosts are not allowed.");
  }

  if (net.isIP(hostname) && isBlockedIp(hostname)) {
    throw new Error("Private IP ranges are not allowed.");
  }

  const records = await dns.lookup(hostname, { all: true });
  if (records.length === 0) {
    throw new Error("Unable to resolve target host.");
  }

  for (const record of records) {
    if (isBlockedIp(record.address)) {
      throw new Error("Resolved address is in a blocked private range.");
    }
  }

  return parsed;
}

async function readResponseTextWithLimit(response: Response): Promise<string> {
  const lengthHeader = response.headers.get("content-length");
  if (lengthHeader) {
    const contentLength = Number(lengthHeader);
    if (Number.isFinite(contentLength) && contentLength > MAX_FETCH_BYTES) {
      throw new Error("Fetched content exceeds 5MB limit.");
    }
  }

  const reader = response.body?.getReader();
  if (!reader) {
    return "";
  }

  const chunks: Uint8Array[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    if (!value) {
      continue;
    }
    total += value.byteLength;
    if (total > MAX_FETCH_BYTES) {
      throw new Error("Fetched content exceeds 5MB limit.");
    }
    chunks.push(value);
  }

  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return new TextDecoder().decode(merged);
}

export async function extractUrlContent(url: string): Promise<string> {
  const validatedUrl = await validateUrlTarget(url);
  const response = await fetch(validatedUrl, {
    headers: {
      "User-Agent": "MEMRYBot/0.1",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch URL: ${response.status}`);
  }

  const html = await readResponseTextWithLimit(response);
  const noScripts = html.replace(/<script[\s\S]*?<\/script>/gi, " ");
  const noStyles = noScripts.replace(/<style[\s\S]*?<\/style>/gi, " ");
  const textOnly = noStyles.replace(/<[^>]+>/g, " ");

  return cleanText(textOnly);
}
