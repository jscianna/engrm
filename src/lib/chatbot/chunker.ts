import { get_encoding } from "tiktoken";

const DEFAULT_CHUNK_TOKENS = 512;
const DEFAULT_OVERLAP_TOKENS = 50;

export type ChunkMetadata = {
  tokenCount: number;
  sectionHeader?: string;
};

export type ChunkedText = {
  content: string;
  chunkIndex: number;
  metadata: ChunkMetadata;
};

const encoder = get_encoding("cl100k_base");
const textDecoder = new TextDecoder();

function countTokens(text: string): number {
  return encoder.encode(text).length;
}

function decodeTokens(tokens: Uint32Array | number[]): string {
  const normalizedTokens = tokens instanceof Uint32Array ? tokens : Uint32Array.from(tokens);
  return textDecoder.decode(encoder.decode(normalizedTokens));
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\r\n/g, "\n").trim();
}

function splitMarkdownSections(markdown: string): Array<{ header?: string; content: string }> {
  const normalized = normalizeWhitespace(markdown);
  if (!normalized) {
    return [];
  }

  const lines = normalized.split("\n");
  const sections: Array<{ header?: string; content: string }> = [];
  let currentHeader: string | undefined;
  let currentLines: string[] = [];

  for (const line of lines) {
    if (/^##\s+/.test(line) && currentLines.length > 0) {
      sections.push({
        header: currentHeader,
        content: currentLines.join("\n").trim(),
      });
      currentHeader = line.trim();
      currentLines = [line];
      continue;
    }

    if (/^##\s+/.test(line)) {
      currentHeader = line.trim();
    }

    currentLines.push(line);
  }

  if (currentLines.length > 0) {
    sections.push({
      header: currentHeader,
      content: currentLines.join("\n").trim(),
    });
  }

  return sections;
}

function chunkSection(
  content: string,
  offset: number,
  header?: string,
  chunkSize = DEFAULT_CHUNK_TOKENS,
  overlap = DEFAULT_OVERLAP_TOKENS,
): ChunkedText[] {
  const normalized = normalizeWhitespace(content);
  if (!normalized) {
    return [];
  }

  const tokens = encoder.encode(normalized);
  const chunks: ChunkedText[] = [];
  const step = Math.max(1, chunkSize - overlap);
  let index = 0;

  for (let start = 0; start < tokens.length; start += step) {
    const end = Math.min(tokens.length, start + chunkSize);
    const text = decodeTokens(tokens.slice(start, end)).trim();
    if (!text) {
      continue;
    }

    chunks.push({
      content: text,
      chunkIndex: offset + index,
      metadata: {
        tokenCount: end - start,
        ...(header ? { sectionHeader: header } : {}),
      },
    });

    index += 1;
    if (end >= tokens.length) {
      break;
    }
  }

  return chunks;
}

export function chunkText(
  text: string,
  options?: {
    type?: "text" | "markdown";
    chunkSize?: number;
    overlap?: number;
  },
): ChunkedText[] {
  const chunkSize = options?.chunkSize ?? DEFAULT_CHUNK_TOKENS;
  const overlap = options?.overlap ?? DEFAULT_OVERLAP_TOKENS;
  const type = options?.type ?? "text";
  const normalized = normalizeWhitespace(text);

  if (!normalized) {
    return [];
  }

  if (type !== "markdown") {
    return chunkSection(normalized, 0, undefined, chunkSize, overlap);
  }

  const sections = splitMarkdownSections(normalized);
  if (sections.length === 0) {
    return [];
  }

  const chunks: ChunkedText[] = [];
  let chunkIndex = 0;

  for (const section of sections) {
    const sectionChunks = chunkSection(
      section.content,
      chunkIndex,
      section.header,
      chunkSize,
      overlap,
    );
    chunks.push(...sectionChunks);
    chunkIndex += sectionChunks.length;
  }

  return chunks;
}

export function getTokenCount(text: string): number {
  return countTokens(text);
}
