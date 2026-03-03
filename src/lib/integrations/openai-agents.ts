type EngrmFetch = typeof fetch;

export type EngrmOpenAIAgentsOptions = {
  baseUrl: string;
  apiKey: string;
  fetchImpl?: EngrmFetch;
};

export function createEngrmOpenAIAgentsMemory(options: EngrmOpenAIAgentsOptions) {
  const baseUrl = options.baseUrl.replace(/\/$/, "");
  const fetchImpl = options.fetchImpl ?? fetch;

  const request = async (path: string, init: RequestInit) => {
    const response = await fetchImpl(`${baseUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
    });

    if (!response.ok) {
      throw new Error(`Engrm request failed with ${response.status}`);
    }

    return response.json();
  };

  return {
    async search(query: string, since?: string) {
      return request("/api/v1/search", {
        method: "POST",
        body: JSON.stringify({ query, since }),
      });
    },

    async store(text: string, title?: string) {
      return request("/api/v1/memories", {
        method: "POST",
        body: JSON.stringify({ text, title }),
      });
    },

    async feedback(memoryId: string, rating: "positive" | "negative", query?: string) {
      return request("/api/v1/feedback", {
        method: "POST",
        body: JSON.stringify({ memoryId, rating, query }),
      });
    },
  };
}
