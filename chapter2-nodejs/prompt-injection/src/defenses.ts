import type { DefenseConfig, DefenseId } from "./types.js";

export const DEFENSES: readonly DefenseConfig[] = [
  {
    id: "d1",
    name: "D1-无额外防御",
    promptHardening: false,
    sourceTagging: false,
    runtimeGuard: false,
  },
  {
    id: "d2",
    name: "D2-提示词加固",
    promptHardening: true,
    sourceTagging: false,
    runtimeGuard: false,
  },
  {
    id: "d3",
    name: "D3-来源标记",
    promptHardening: true,
    sourceTagging: true,
    runtimeGuard: false,
  },
  {
    id: "d4",
    name: "D4-组合防御",
    promptHardening: true,
    sourceTagging: true,
    runtimeGuard: true,
  },
];

export function findDefense(id: DefenseId): DefenseConfig {
  const defense = DEFENSES.find((item) => item.id === id);
  if (!defense) {
    throw new Error(`未知防御配置：${id}`);
  }
  return defense;
}
