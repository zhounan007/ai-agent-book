import { resolve } from "node:path";

export function resolveProjectRoot(
  cwd = process.cwd(),
  configuredRoot = process.env.AGENT_SKILLS_PPT_ROOT,
): string {
  return resolve(configuredRoot?.trim() || cwd);
}

export const PROJECT_ROOT = resolveProjectRoot();
export const SKILLS_ROOT = resolve(PROJECT_ROOT, "skills");
export const DEFAULT_PAPER = resolve(PROJECT_ROOT, "papers/sample-paper.md");
export const DEFAULT_OUTLINE = resolve(PROJECT_ROOT, "papers/sample-outline.json");
export const DEFAULT_OUTPUT = resolve(PROJECT_ROOT, "output/presentation.pptx");
