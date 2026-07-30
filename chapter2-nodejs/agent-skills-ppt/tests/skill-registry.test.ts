import { describe, expect, it } from "vitest";
import { SkillRegistry } from "../src/skill-registry.js";

describe("SkillRegistry", () => {
  it("scans only thin Skill metadata", async () => {
    const registry = new SkillRegistry();
    const skills = await registry.scan();

    expect(skills).toHaveLength(1);
    expect(skills[0]).toMatchObject({ name: "pptx" });
    expect(registry.thinCatalog()).toContain("Use when");
    expect(registry.thinCatalog()).not.toContain("核心流程（第二层）");
  });

  it("loads the complete SKILL.md on demand", async () => {
    const registry = new SkillRegistry();
    await registry.scan();

    const content = await registry.readSkill("pptx");
    expect(content).toContain("核心流程（第二层）");
    expect(content).toContain("run_skill_script");
  });

  it("loads third-level reference files on demand", async () => {
    const registry = new SkillRegistry();
    await registry.scan();

    const content = await registry.readSkillFile("pptx", "reference.md");
    expect(content).toContain("第三层");
    expect(content).toContain("PptxGenJS");
  });

  it("rejects paths escaping the Skill directory", async () => {
    const registry = new SkillRegistry();
    await registry.scan();

    await expect(
      registry.readSkillFile("pptx", "../../papers/sample-paper.md"),
    ).rejects.toThrow("路径越界");
  });
});
