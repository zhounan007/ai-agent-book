import { describe, expect, it } from "vitest";
import { parseCliArgs } from "./main.js";

describe("CLI 参数", () => {
  it("解析问题和选项", () => {
    const parsed = parseCliArgs([
      "比特币",
      "现价",
      "--provider",
      "offline-demo",
      "--max-steps",
      "3",
      "--quiet",
    ]);
    expect(parsed.question).toBe("比特币 现价");
    expect(parsed.options).toMatchObject({
      provider: "offline-demo",
      maxSteps: 3,
      quiet: true,
    });
  });

  it("拒绝无效的最大步数", () => {
    expect(() => parseCliArgs(["--max-steps", "0"])).toThrow("正整数");
  });

  it("按 provider 选择默认模型和 Base URL", () => {
    expect(parseCliArgs(["--provider", "bailian"]).options).toMatchObject({
      provider: "bailian",
      model: "qwen3.7-plus",
      baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    });
    expect(parseCliArgs(["--provider", "deepseek"]).options).toMatchObject({
      provider: "deepseek",
      model: "deepseek-v4-flash",
      baseURL: "https://api.deepseek.com",
    });
  });
});
