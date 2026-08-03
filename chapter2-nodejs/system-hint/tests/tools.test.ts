import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import { AgentStatusStore } from "../src/status-store.js";
import { AGENT_TOOLS, SafeToolDispatcher } from "../src/tools.js";

function createDispatcher(initialDirectory = process.cwd()): SafeToolDispatcher {
  const root = process.cwd();
  const status = new AgentStatusStore({
    strategy: "replace",
    features: {
      timestamps: true,
      toolCounter: true,
      todoList: true,
      detailedErrors: true,
      systemState: true,
    },
    initialDirectory,
  });
  return new SafeToolDispatcher(root, status);
}

describe("SafeToolDispatcher", () => {
  it("拒绝模型返回的错误工具名", async () => {
    const result = await createDispatcher().execute(
      "run_skill_scrip",
      "{}",
    );

    expect(result.isError).toBe(true);
    expect(result.content).toContain("未知工具");
    expect(result.content).toContain("run_skill_scrip");
  });

  it("拒绝额外字段和越界路径", async () => {
    const dispatcher = createDispatcher();
    const unexpected = await dispatcher.execute(
      "read_file",
      JSON.stringify({ file_path: "README.md", unsafe: true }),
    );
    const escaped = await dispatcher.execute(
      "read_file",
      JSON.stringify({ file_path: "../../book/chapter2.md" }),
    );

    expect(unexpected.isError).toBe(true);
    expect(unexpected.content).toContain("未定义字段");
    expect(escaped.isError).toBe(true);
    expect(escaped.content).toContain("路径越界");
  });

  it("明确提示相对路径以当前工作目录为基准", async () => {
    const currentDirectory = resolve(process.cwd(), "src");
    const result = await createDispatcher(currentDirectory).execute(
      "read_file",
      JSON.stringify({ file_path: "src/status-store.ts" }),
    );
    const readFileTool = AGENT_TOOLS.find(
      (tool) => tool.function.name === "read_file",
    );

    expect(result.isError).toBe(true);
    expect(result.content).toContain(`当前工作目录：${currentDirectory}`);
    expect(result.content).toContain("相对路径基于当前工作目录");
    expect(readFileTool?.function.description).toContain(
      "相对于状态栏中的当前工作目录",
    );
  });
});
