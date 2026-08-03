import { describe, expect, it } from "vitest";
import { AgentStatusStore } from "../src/status-store.js";

const features = {
  timestamps: true,
  toolCounter: true,
  todoList: true,
  detailedErrors: true,
  systemState: true,
};

describe("AgentStatusStore", () => {
  it("把代码维护的状态渲染为结构化状态栏", () => {
    const store = new AgentStatusStore({
      strategy: "replace",
      features,
      initialDirectory: "/project",
      now: () => new Date("2026-07-29T02:30:00.000Z"),
    });
    store.setIteration(3);
    store.recordToolCall("read_file");
    store.rewriteTodos(["读取 README", "总结"]);
    store.updateTodos([{ id: 1, status: "in_progress" }]);
    store.recordError("File not found");

    const rendered = store.render();
    expect(rendered).toContain('<agent_status update_strategy="replace">');
    expect(rendered).toContain("<iteration>3</iteration>");
    expect(rendered).toContain("read_file=1");
    expect(rendered).toContain("[1] in_progress: 读取 README");
    expect(rendered).toContain("File not found");
    expect(rendered).toContain("cwd=/project");
  });

  it("禁止同时存在两个 in_progress TODO", () => {
    const store = new AgentStatusStore({
      strategy: "append",
      features,
      initialDirectory: "/project",
    });
    store.rewriteTodos(["第一项", "第二项"]);
    store.updateTodos([{ id: 1, status: "in_progress" }]);

    expect(() =>
      store.updateTodos([{ id: 2, status: "in_progress" }]),
    ).toThrow("只能有一个");
  });
});
