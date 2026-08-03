import { config as loadDotenv } from "dotenv";
import { resolve } from "node:path";
import type { StatusFeatures } from "./status-store.js";
import type { StatusUpdateStrategy } from "./types.js";

loadDotenv({ path: resolve(process.cwd(), ".env") });

export interface AppConfig {
  apiKey?: string;
  baseUrl: string;
  model: string;
  maxTurns: number;
  strategy: StatusUpdateStrategy;
  features: StatusFeatures;
  saveTrajectory: boolean;
  trajectoryPath: string;
  projectRoot: string;
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
    maxTurns: positiveInteger(process.env.MAX_AGENT_TURNS, 8),
    strategy: parseStrategy(
      process.env.STATUS_UPDATE_STRATEGY?.trim() || "replace",
    ),
    features: {
      timestamps: booleanValue(process.env.ENABLE_TIMESTAMPS, true),
      toolCounter: booleanValue(process.env.ENABLE_TOOL_COUNTER, true),
      todoList: booleanValue(process.env.ENABLE_TODO_LIST, true),
      detailedErrors: booleanValue(
        process.env.ENABLE_DETAILED_ERRORS,
        true,
      ),
      systemState: booleanValue(process.env.ENABLE_SYSTEM_STATE, true),
    },
    saveTrajectory: booleanValue(process.env.SAVE_TRAJECTORY, true),
    trajectoryPath: resolve(
      process.cwd(),
      process.env.TRAJECTORY_PATH?.trim() || "output/trajectory.json",
    ),
    projectRoot: resolve(process.cwd()),
  };
}

export function parseStrategy(value: string): StatusUpdateStrategy {
  if (value === "none" || value === "replace" || value === "append") {
    return value;
  }
  throw new Error(
    `STATUS_UPDATE_STRATEGY 必须是 none、replace 或 append，实际为 ${JSON.stringify(value)}。`,
  );
}

function booleanValue(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) {
    return fallback;
  }
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }
  throw new Error(`布尔环境变量必须是 true 或 false，实际为 ${value}。`);
}

function positiveInteger(value: string | undefined, fallback: number): number {
  if (value === undefined) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`MAX_AGENT_TURNS 必须是正整数，实际为 ${value}。`);
  }
  return parsed;
}
