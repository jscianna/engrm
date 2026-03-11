/**
 * Local Retrieval Adapter
 *
 * Edge-first retrieval for cached/local memories before falling back to hybrid search.
 */

export type LocalRetrievalResult = {
  hit: boolean;
  memoryIds: string[];
  confidence: number;
};

/**
 * Attempt local/edge retrieval for a query.
 *
 * Currently stubbed - returns no hit. Future implementation will query
 * edge cache or local storage for fast memory lookups.
 *
 * @param query - The user's query message
 * @param userId - The user's ID for scoping
 * @returns LocalRetrievalResult with hit status and candidate memory IDs
 */
export async function localRetrieve(
  query: string,
  userId: string,
): Promise<LocalRetrievalResult> {
  // Stubbed: always returns no hit
  // Future: query edge cache, local indexeddb, or in-memory LRU
  return {
    hit: false,
    memoryIds: [],
    confidence: 0,
  };
}
