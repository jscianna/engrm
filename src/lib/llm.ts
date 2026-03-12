const OPENAI_CHAT_COMPLETIONS_URL = "https://api.openai.com/v1/chat/completions";
const OPENROUTER_CHAT_COMPLETIONS_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL = "gpt-4o-mini";
const DEFAULT_OPENROUTER_MODEL = "openai/gpt-4o-mini";
const REQUEST_TIMEOUT_MS = 45_000;

type CallLLMOptions = {
  model?: string;
};

type ChatProvider = "openai" | "openrouter";

export class LLMError extends Error {
  status: number;
  code: string;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

type ProviderConfig = {
  provider: ChatProvider;
  url: string;
  apiKey: string;
  model: string;
  extraHeaders?: Record<string, string>;
};

function normalizeProvider(value: string | undefined): ChatProvider | null {
  if (!value) {
    return null;
  }

  switch (value.trim().toLowerCase()) {
    case "openai":
      return "openai";
    case "openrouter":
      return "openrouter";
    default:
      return null;
  }
}

function resolveModelForProvider(provider: ChatProvider, requestedModel?: string): string {
  if (provider === "openrouter") {
    const configured = process.env.OPENROUTER_MODEL || requestedModel || DEFAULT_OPENROUTER_MODEL;
    return configured.includes("/") ? configured : `openai/${configured}`;
  }

  return process.env.OPENAI_MODEL || requestedModel || DEFAULT_MODEL;
}

function buildProviderConfigs(options?: CallLLMOptions): ProviderConfig[] {
  const configuredProvider = normalizeProvider(process.env.LLM_PROVIDER);
  const openAiKey = process.env.OPENAI_API_KEY;
  const openRouterKey = process.env.OPENROUTER_API_KEY;

  const configsByProvider: Partial<Record<ChatProvider, ProviderConfig>> = {};

  if (openAiKey) {
    configsByProvider.openai = {
      provider: "openai",
      url: OPENAI_CHAT_COMPLETIONS_URL,
      apiKey: openAiKey,
      model: resolveModelForProvider("openai", options?.model),
    };
  }

  if (openRouterKey) {
    configsByProvider.openrouter = {
      provider: "openrouter",
      url: OPENROUTER_CHAT_COMPLETIONS_URL,
      apiKey: openRouterKey,
      model: resolveModelForProvider("openrouter", options?.model),
      extraHeaders: {
        "HTTP-Referer": "https://fathippo.ai",
        "X-Title": "FatHippo Memory",
      },
    };
  }

  if (configuredProvider) {
    const preferred = configsByProvider[configuredProvider];
    const fallback = configuredProvider === "openai" ? configsByProvider.openrouter : configsByProvider.openai;
    return [preferred, fallback].filter((value): value is ProviderConfig => Boolean(value));
  }

  return [configsByProvider.openai, configsByProvider.openrouter].filter(
    (value): value is ProviderConfig => Boolean(value),
  );
}

async function callProvider(
  config: ProviderConfig,
  prompt: string,
  systemPrompt?: string,
): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(config.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
        ...config.extraHeaders,
      },
      body: JSON.stringify({
        model: config.model,
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
        `${config.provider} chat request failed with ${response.status}: ${await response.text()}`,
        response.status >= 400 ? response.status : 502,
      );
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (typeof content !== "string" || !content.trim()) {
      throw new LLMError(
        "LLM_INVALID_RESPONSE",
        `${config.provider} chat request returned an empty response`,
        502,
      );
    }

    return content;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new LLMError("LLM_TIMEOUT", `${config.provider} chat request timed out`, 504);
    }
    if (error instanceof LLMError) {
      throw error;
    }
    throw new LLMError("LLM_UPSTREAM_ERROR", `${config.provider} chat request failed`, 502);
  } finally {
    clearTimeout(timeout);
  }
}

function shouldTryFallback(error: unknown): boolean {
  if (!(error instanceof LLMError)) {
    return true;
  }
  return error.status === 429 || error.status >= 500 || error.code === "LLM_TIMEOUT";
}

export async function callLLM(
  prompt: string,
  systemPrompt?: string,
  options?: CallLLMOptions,
): Promise<string> {
  const providers = buildProviderConfigs(options);
  if (providers.length === 0) {
    throw new LLMError(
      "LLM_UNAVAILABLE",
      "No LLM provider configured. Set OPENAI_API_KEY or OPENROUTER_API_KEY.",
      503,
    );
  }

  let lastError: unknown = null;
  for (let index = 0; index < providers.length; index += 1) {
    try {
      return await callProvider(providers[index], prompt, systemPrompt);
    } catch (error) {
      lastError = error;
      if (index === providers.length - 1 || !shouldTryFallback(error)) {
        break;
      }
    }
  }

  if (lastError instanceof LLMError) {
    throw lastError;
  }
  throw new LLMError("LLM_UPSTREAM_ERROR", "LLM request failed", 502);
}
