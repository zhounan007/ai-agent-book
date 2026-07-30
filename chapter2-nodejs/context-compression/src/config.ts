import { config as loadDotenv } from "dotenv";
import { resolve } from "node:path";
import type { CompressionStrategy } from "./types.js";

loadDotenv({ path: resolve(process.cwd(), ".env") });

export interface AppConfig {
  apiKey?: string;
  baseUrl: string;
  model: string;
  strategy: CompressionStrategy;
  slidingWindowSize: number;
  saveTrajectory: boolean;
  trajectoryDir: string;
}

export function loadConfig(): AppConfig {
  return {
    ...(process.env.DASHSCOPE_API_KEY?.trim()
      ? { apiKey: process.env.DASHSCOPE_API_KEY.trim() }
      : {}),
    baseUrl:
      process.env.DASHSCOPE_BASE_URL?.trim() ||
      "https://dashscope.aliyuncs.com/compatible-mode/v1",
    model: process.env.DASHSCOPE_MODEL?.trim() || "qwen3.7-plus",
    strategy: parseStrategy(
      process.env.COMPRESSION_STRATEGY?.trim() ||
        "context-aware",
    ),
    slidingWindowSize: positiveInteger(
      process.env.SLIDING_WINDOW_SIZE,
      2,
    ),
    saveTrajectory: booleanValue(
      process.env.SAVE_TRAJECTORY,
      true,
    ),
    trajectoryDir: resolve(
      process.cwd(),
      process.env.TRAJECTORY_DIR?.trim() || "output",
    ),
  };
}

export function parseStrategy(value: string): CompressionStrategy {
  if (
    value === "none" ||
    value === "sliding-window" ||
    value === "context-aware"
  ) {
    return value;
  }
  throw new Error(
    `压缩策略必须是 none、sliding-window 或 context-aware，实际为 ${JSON.stringify(value)}。`,
  );
}

function positiveInteger(
  value: string | undefined,
  fallback: number,
): number {
  if (value === undefined) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(
      `SLIDING_WINDOW_SIZE 必须是正整数，实际为 ${value}。`,
    );
  }
  return parsed;
}

function booleanValue(
  value: string | undefined,
  fallback: boolean,
): boolean {
  if (value === undefined) {
    return fallback;
  }
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }
  throw new Error(
    `布尔环境变量必须是 true 或 false，实际为 ${value}。`,
  );
}
