import "dotenv/config";

export interface DemoConfig {
  apiKey: string;
  baseURL: string;
  model: string;
  maxTurns: number;
}

export const DEFAULT_BASE_URL =
  "https://dashscope.aliyuncs.com/compatible-mode/v1";
export const DEFAULT_MODEL = "qwen3.7-plus";

function positiveInteger(name: string, fallback: number): number {
  const value = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

export function loadOnlineConfig(): DemoConfig {
  const apiKey = process.env.DASHSCOPE_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("缺少 DASHSCOPE_API_KEY，请参考 env.example。");
  }
  return {
    apiKey,
    baseURL: process.env.DASHSCOPE_BASE_URL?.trim() || DEFAULT_BASE_URL,
    model: process.env.DASHSCOPE_MODEL?.trim() || DEFAULT_MODEL,
    maxTurns: positiveInteger("MAX_AGENT_TURNS", 8),
  };
}
