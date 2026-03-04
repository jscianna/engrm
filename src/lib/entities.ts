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
  // Common generic words that don't make good entities
  "Today",
  "Tomorrow",
  "Yesterday",
  "Now",
  "Here",
  "Then",
  "Also",
  "Just",
  "Very",
  "Really",
  "Actually",
  "Maybe",
  "Perhaps",
  "Some",
  "Many",
  "Most",
  "Other",
  "New",
  "Good",
  "Great",
  "Best",
  "First",
  "Last",
  "Next",
  "Should",
  "Would",
  "Could",
  "Will",
  "Can",
  "May",
  "Must",
  "Need",
  "Want",
  "Think",
  "Know",
  "See",
  "Get",
  "Make",
  "Take",
  "Use",
  "Try",
  "Let",
  "Help",
  "Start",
  "End",
  "Time",
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

/**
 * Find shared entities between two sets of entities.
 * Returns the list of entities that appear in both sets.
 */
export function findSharedEntities(entitiesA: string[], entitiesB: string[]): string[] {
  if (entitiesA.length === 0 || entitiesB.length === 0) {
    return [];
  }

  const setB = new Set(entitiesB.map(normalizeEntityKey));
  const shared: string[] = [];
  const seen = new Set<string>();

  for (const entity of entitiesA) {
    const key = normalizeEntityKey(entity);
    if (setB.has(key) && !seen.has(key)) {
      shared.push(entity);
      seen.add(key);
    }
  }

  return shared;
}

/**
 * Check if two memories share enough entities to warrant linking.
 * Returns true if they share at least minShared entities.
 */
export function shouldLinkByEntities(
  entitiesA: string[],
  entitiesB: string[],
  minShared: number = 1
): boolean {
  return countEntityOverlap(entitiesA, entitiesB) >= minShared;
}
