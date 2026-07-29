import "dotenv/config";

export const DEFAULT_KIMI_BASE_URL = "https://api.moonshot.cn/v1";
export const DEFAULT_MODEL = "kimi-k3";
export const DEFAULT_BAILIAN_BASE_URL =
  "https://dashscope.aliyuncs.com/compatible-mode/v1";
export const DEFAULT_BAILIAN_MODEL = "qwen3.7-plus";
export const DEFAULT_DEEPSEEK_BASE_URL = "https://api.deepseek.com";
export const DEFAULT_DEEPSEEK_MODEL = "deepseek-v4-flash";

export type LlmProvider = "kimi" | "bailian" | "deepseek";

export interface ResolvedBackend {
  provider: LlmProvider;
  apiKey: string;
  baseURL: string;
  model: string;
  usingOpenRouter: boolean;
  supportsWebSearch: boolean;
}

export function mapModelToOpenRouter(model: string): string {
  const normalized = model.trim();
  if (normalized.includes("/")) return normalized;

  const lower = normalized.toLowerCase();
  if (/^(gpt-|o1-|o3-|o4-)/.test(lower)) {
    return `openai/${normalized}`;
  }
  if (lower.startsWith("claude-")) {
    if (lower.includes("sonnet")) return "anthropic/claude-sonnet-4.6";
    if (lower.includes("haiku")) return "anthropic/claude-haiku-4.5";
    return "anthropic/claude-opus-4.8";
  }
  if (lower.startsWith("kimi")) return "moonshotai/kimi-k2.6";
  return process.env.OPENROUTER_MODEL ?? "openai/gpt-5.6-luna";
}

export function resolveLlmBackend(
  primaryKey: string | undefined,
  primaryBaseURL: string,
  model: string,
): ResolvedBackend {
  const openRouterKey = process.env.OPENROUTER_API_KEY;
  const preferOpenRouter = openRouterKey && model.toLowerCase().startsWith("gpt-5");

  if (preferOpenRouter || (!primaryKey && openRouterKey)) {
    return {
      provider: "kimi",
      apiKey: openRouterKey,
      baseURL: process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1",
      model: mapModelToOpenRouter(model),
      usingOpenRouter: true,
      supportsWebSearch: false,
    };
  }
  if (primaryKey) {
    return {
      provider: "kimi",
      apiKey: primaryKey,
      baseURL: primaryBaseURL,
      model,
      usingOpenRouter: false,
      supportsWebSearch: true,
    };
  }
  throw new Error(
    "未找到 API Key。请设置 MOONSHOT_API_KEY / KIMI_API_KEY，或设置 OPENROUTER_API_KEY 作为兜底。",
  );
}

export interface ProviderOverrides {
  apiKey?: string;
  baseURL?: string;
  model?: string;
}

export function resolveProviderBackend(
  provider: LlmProvider,
  overrides: ProviderOverrides = {},
): ResolvedBackend {
  if (provider === "kimi") {
    const primaryKey =
      overrides.apiKey ??
      process.env.MOONSHOT_API_KEY ??
      process.env.KIMI_API_KEY;
    return resolveLlmBackend(
      primaryKey,
      overrides.baseURL ?? process.env.KIMI_BASE_URL ?? DEFAULT_KIMI_BASE_URL,
      overrides.model ?? process.env.KIMI_MODEL ?? DEFAULT_MODEL,
    );
  }

  if (provider === "bailian") {
    const apiKey = overrides.apiKey ?? process.env.DASHSCOPE_API_KEY;
    if (!apiKey) {
      throw new Error("未找到 DASHSCOPE_API_KEY。");
    }
    return {
      provider,
      apiKey,
      baseURL:
        overrides.baseURL ??
        process.env.DASHSCOPE_BASE_URL ??
        DEFAULT_BAILIAN_BASE_URL,
      model:
        overrides.model ??
        process.env.DASHSCOPE_MODEL ??
        DEFAULT_BAILIAN_MODEL,
      usingOpenRouter: false,
      supportsWebSearch: true,
    };
  }

  const apiKey = overrides.apiKey ?? process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    throw new Error("未找到 DEEPSEEK_API_KEY。");
  }
  return {
    provider,
    apiKey,
    baseURL:
      overrides.baseURL ??
      process.env.DEEPSEEK_BASE_URL ??
      DEFAULT_DEEPSEEK_BASE_URL,
    model:
      overrides.model ??
      process.env.DEEPSEEK_MODEL ??
      DEFAULT_DEEPSEEK_MODEL,
    usingOpenRouter: false,
    supportsWebSearch: false,
  };
}

export function getProviderDefaults(provider: LlmProvider): {
  baseURL: string;
  model: string;
} {
  if (provider === "bailian") {
    return {
      baseURL: process.env.DASHSCOPE_BASE_URL ?? DEFAULT_BAILIAN_BASE_URL,
      model: process.env.DASHSCOPE_MODEL ?? DEFAULT_BAILIAN_MODEL,
    };
  }
  if (provider === "deepseek") {
    return {
      baseURL: process.env.DEEPSEEK_BASE_URL ?? DEFAULT_DEEPSEEK_BASE_URL,
      model: process.env.DEEPSEEK_MODEL ?? DEFAULT_DEEPSEEK_MODEL,
    };
  }
  return {
    baseURL: process.env.KIMI_BASE_URL ?? DEFAULT_KIMI_BASE_URL,
    model: process.env.KIMI_MODEL ?? DEFAULT_MODEL,
  };
}

function readPositiveInteger(name: string, fallback: number): number {
  const parsed = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export const config = {
  get moonshotApiKey(): string {
    return process.env.MOONSHOT_API_KEY ?? process.env.KIMI_API_KEY ?? "";
  },
  get kimiBaseURL(): string {
    return process.env.KIMI_BASE_URL ?? DEFAULT_KIMI_BASE_URL;
  },
  get defaultModel(): string {
    return process.env.KIMI_MODEL ?? process.env.DEFAULT_MODEL ?? DEFAULT_MODEL;
  },
  get maxSearchIterations(): number {
    return readPositiveInteger("MAX_SEARCH_ITERATIONS", 5);
  },
  get searchTimeout(): number {
    return readPositiveInteger("SEARCH_TIMEOUT", 30);
  },
  validate(): boolean {
    if (this.moonshotApiKey || process.env.OPENROUTER_API_KEY) return true;
    console.error("错误：未设置 MOONSHOT_API_KEY / KIMI_API_KEY。");
    console.error("也可以设置 OPENROUTER_API_KEY 作为无实时搜索能力的兜底。");
    return false;
  },
  getApiKey(apiKey?: string): string {
    return apiKey || this.moonshotApiKey;
  },
};
