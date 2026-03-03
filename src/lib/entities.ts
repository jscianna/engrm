const STOP_WORDS = new Set([
  "A",
  "An",
  "And",
  "At",
  "But",
  "By",
  "For",
  "From",
  "He",
  "Her",
  "His",
  "I",
  "If",
  "In",
  "Into",
  "It",
  "Its",
  "My",
  "Of",
  "On",
  "Or",
  "Our",
  "She",
  "That",
  "The",
  "Their",
  "There",
  "They",
  "This",
  "Those",
  "To",
  "We",
  "What",
  "When",
  "Where",
  "Who",
  "Why",
  "You",
  "Your",
]);

function normalizeEntity(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function addEntity(target: Set<string>, value: string) {
  const normalized = normalizeEntity(value);
  if (!normalized || normalized.length < 2) {
    return;
  }
  if (STOP_WORDS.has(normalized)) {
    return;
  }
  target.add(normalized);
}

export function extractEntities(text: string): string[] {
  const value = text.trim();
  if (!value) {
    return [];
  }

  const entities = new Set<string>();

  for (const match of value.matchAll(/(^|\s)@([a-zA-Z0-9_]{2,32})\b/g)) {
    addEntity(entities, `@${match[2]}`);
  }

  for (const match of value.matchAll(/\b(?:[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})(?:\s+(?:AI|Labs|Lab|Inc|LLC|Ltd|Corp|Corporation|Company|Technologies|Systems|Studio|University))?\b/g)) {
    addEntity(entities, match[0]);
  }

  for (const match of value.matchAll(/\b[A-Z]{2,}(?:\.[A-Z]{2,})*\b/g)) {
    addEntity(entities, match[0]);
  }

  for (const match of value.matchAll(/\b(?:Next\.js|Node\.js|TypeScript|JavaScript|SQLite|Postgres|Turso|OpenAI|LangChain|Qdrant|Vercel|GitHub|Docker|Kubernetes)\b/gi)) {
    addEntity(entities, match[0]);
  }

  return Array.from(entities).slice(0, 24);
}

export function normalizeEntityKey(value: string): string {
  return value.trim().toLowerCase();
}

export function countEntityOverlap(queryEntities: string[], memoryEntities: string[]): number {
  if (queryEntities.length === 0 || memoryEntities.length === 0) {
    return 0;
  }

  const query = new Set(queryEntities.map(normalizeEntityKey));
  let overlap = 0;
  for (const entity of memoryEntities) {
    if (query.has(normalizeEntityKey(entity))) {
      overlap += 1;
    }
  }
  return overlap;
}
