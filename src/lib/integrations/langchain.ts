type FatHippoFetch = typeof fetch;

export type FatHippoLangChainMemoryOptions = {
  baseUrl: string;
  apiKey: string;
  namespace?: string;
  fetchImpl?: FatHippoFetch;
};

export class FatHippoLangChainMemory {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly namespace?: string;
  private readonly fetchImpl: FatHippoFetch;

  constructor(options: FatHippoLangChainMemoryOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.apiKey = options.apiKey;
    this.namespace = options.namespace;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async saveContext(input: string, output?: string) {
    const text = output ? `${input}\n\n${output}` : input;
    return this.store(text);
  }

  async loadMemoryVariables(query: string, since?: string) {
    const response = await this.fetchImpl(`${this.baseUrl}/api/v1/search`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        query,
        since,
        namespace: this.namespace,
      }),
    });

    if (!response.ok) {
      throw new Error(`FatHippo search failed with ${response.status}`);
    }

    return response.json();
  }

  async store(text: string, title?: string) {
    const response = await this.fetchImpl(`${this.baseUrl}/api/v1/memories`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        title,
        text,
        namespace: this.namespace,
      }),
    });

    if (!response.ok) {
      throw new Error(`FatHippo store failed with ${response.status}`);
    }

    return response.json();
  }
}
