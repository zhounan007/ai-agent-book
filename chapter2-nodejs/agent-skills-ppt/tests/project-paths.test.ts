import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveProjectRoot } from "../src/project-paths.js";

describe("resolveProjectRoot", () => {
  it("uses cwd for both source and compiled entry points", () => {
    const cwd = "/workspace/agent-skills-ppt";

    expect(resolveProjectRoot(cwd)).toBe(resolve(cwd));
  });

  it("allows an explicit project root override", () => {
    expect(
      resolveProjectRoot("/unrelated", "/workspace/agent-skills-ppt"),
    ).toBe(resolve("/workspace/agent-skills-ppt"));
  });
});
