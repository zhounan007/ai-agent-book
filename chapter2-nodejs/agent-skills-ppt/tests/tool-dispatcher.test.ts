import { describe, expect, it } from "vitest";
import { SkillRegistry } from "../src/skill-registry.js";
import { ToolDispatcher } from "../src/tool-dispatcher.js";

describe("ToolDispatcher", () => {
  it("returns structured errors for malformed calls", async () => {
    const registry = new SkillRegistry();
    await registry.scan();
    const dispatcher = new ToolDispatcher(registry, {
      outputPath: "/tmp/not-created.pptx",
      sourceLabel: "test",
    });

    expect(JSON.parse(await dispatcher.execute("read_skill", "{}"))).toEqual({
      error: "缺少字符串参数 name。",
    });
    expect(
      JSON.parse(
        await dispatcher.execute(
          "run_skill_script",
          JSON.stringify({
            name: "pptx",
            script: "shell",
            payload: {},
          }),
        ),
      ).error,
    ).toContain("白名单");
  });
});
