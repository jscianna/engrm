const OPENAI_CHAT_COMPLETIONS_URL = "https://api.openai.com/v1/chat/completions";
const DEFAULT_MODEL = "gpt-4o-mini";
const REQUEST_TIMEOUT_MS = 45_000;

type CallLLMOptions = {
  model?: string;
};

export class LLMError extends Error {
  status: number;
  code: string;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export async function callLLM(
  prompt: string,
  systemPrompt?: string,
  options?: CallLLMOptions,
): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new LLMError(
      "LLM_UNAVAILABLE",
      "OPENAI_API_KEY is required for LLM-powered memory features",
      503,
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(OPENAI_CHAT_COMPLETIONS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: options?.model ?? DEFAULT_MODEL,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          ...(systemPrompt ? [{ role: "system", content: systemPrompt }] : []),
          { role: "user", content: prompt },
        ],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new LLMError(
        "LLM_UPSTREAM_ERROR",
        `OpenAI chat request failed with ${response.status}: ${await response.text()}`,
        502,
      );
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (typeof content !== "string" || !content.trim()) {
      throw new LLMError(
        "LLM_INVALID_RESPONSE",
        "OpenAI chat request returned an empty response",
        502,
      );
    }

    return content;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new LLMError("LLM_TIMEOUT", "OpenAI chat request timed out", 504);
    }
    if (error instanceof LLMError) {
      throw error;
    }
    throw new LLMError("LLM_UPSTREAM_ERROR", "OpenAI chat request failed", 502);
  } finally {
    clearTimeout(timeout);
  }
}
