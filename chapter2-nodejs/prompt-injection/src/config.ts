import { config as loadDotenv } from "dotenv";
import { resolve } from "node:path";
import type { AttackId, DefenseId } from "./types.js";

loadDotenv({ path: resolve(process.cwd(), ".env") });

export interface AppConfig {
  apiKey?: string;
  baseUrl: string;
  model: string;
  attack: AttackId;
  defense: DefenseId;
  trials: number;
  maxSteps: number;
  temperature: number;
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
    attack: parseAttack(
      process.env.PROMPT_INJECTION_ATTACK?.trim() || "indirect",
    ),
    defense: parseDefense(
      process.env.PROMPT_INJECTION_DEFENSE?.trim() || "d1",
    ),
    trials: positiveInteger(
      process.env.PROMPT_INJECTION_TRIALS,
      1,
      "PROMPT_INJECTION_TRIALS",
    ),
    maxSteps: positiveInteger(
      process.env.MAX_AGENT_STEPS,
      6,
      "MAX_AGENT_STEPS",
    ),
    temperature: numberInRange(
      process.env.MODEL_TEMPERATURE,
      0.2,
      0,
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

export function parseAttack(value: string): AttackId {
  if (
    value === "direct" ||
    value === "indirect" ||
    value === "memory"
  ) {
    return value;
  }
  throw new Error(
    `攻击场景必须是 direct、indirect 或 memory，实际为 ${JSON.stringify(value)}。`,
  );
}

export function parseDefense(value: string): DefenseId {
  if (
    value === "d1" ||
    value === "d2" ||
    value === "d3" ||
    value === "d4"
  ) {
    return value;
  }
  throw new Error(
    `防御配置必须是 d1、d2、d3 或 d4，实际为 ${JSON.stringify(value)}。`,
  );
}

function positiveInteger(
  value: string | undefined,
  fallback: number,
  name: string,
): number {
  if (value === undefined) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${name} 必须是正整数，实际为 ${value}。`);
  }
  return parsed;
}

function numberInRange(
  value: string | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  if (value === undefined) {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    throw new Error(
      `MODEL_TEMPERATURE 必须在 ${min} 到 ${max} 之间，实际为 ${value}。`,
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
