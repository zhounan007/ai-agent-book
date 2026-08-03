import { resolve } from "node:path";
import { SystemHintAgent } from "./agent.js";
import { AgentStatusStore, type StatusFeatures } from "./status-store.js";
import type {
  AgentMessage,
  CompletionGateway,
  CompletionRequest,
  CompletionResult,
  StatusUpdateStrategy,
} from "./types.js";

const FEATURES: StatusFeatures = {
  timestamps: true,
  toolCounter: true,
  todoList: true,
  detailedErrors: true,
  systemState: true,
};

export async function runOfflineDemo(
  projectRoot: string,
  selectedStrategy?: StatusUpdateStrategy,
): Promise<void> {
  const strategies = selectedStrategy
    ? [selectedStrategy]
    : (["none", "replace", "append"] as const);
  console.log("【离线模式】使用脚本化模型，不调用百炼。\n");

  for (const strategy of strategies) {
    const requests: AgentMessage[][] = [];
    const status = new AgentStatusStore({
      strategy,
      features: FEATURES,
      initialDirectory: projectRoot,
      now: () => new Date("2026-07-29T02:30:00.000Z"),
    });
    const agent = new SystemHintAgent({
      gateway: new ScriptedGateway(),
      model: "offline-scripted-model",
      status,
      projectRoot,
      maxTurns: 7,
      saveTrajectory: true,
      trajectoryPath: resolve(
        projectRoot,
        `output/offline-${strategy}-trajectory.json`,
      ),
      onRequest: (_iteration, messages) => requests.push(messages),
    });
    const result = await agent.run(
      "分析当前项目：先建立 TODO，尝试读取 missing.md；失败后列出目录并总结。",
    );
    console.log(`=== ${strategy.toUpperCase()} ===`);
    console.log(`迭代次数：${result.iterations}`);
    console.log(`最终回答：${result.finalAnswer}`);
    console.log(
      `请求消息数变化：${requests.map((messages) => messages.length).join(" → ")}`,
    );
    console.log("错误发生后的末尾状态：");
    console.log(findLatestStatus(requests[4] ?? []));
    console.log(`轨迹：${result.trajectoryPath}\n`);
  }
}

class ScriptedGateway implements CompletionGateway {
  #turn = 0;

  async complete(_request: CompletionRequest): Promise<CompletionResult> {
    this.#turn += 1;
    switch (this.#turn) {
      case 1:
        return toolCall(
          "call-1",
          "rewrite_todo_list",
          JSON.stringify({
            items: ["读取目标文件", "失败后检查目录", "总结观察结果"],
          }),
        );
      case 2:
        return toolCall(
          "call-2",
          "update_todo_status",
          JSON.stringify({
            updates: [{ id: 1, status: "in_progress" }],
          }),
        );
      case 3:
        return toolCall(
          "call-3",
          "read_file",
          JSON.stringify({ file_path: "missing.md" }),
        );
      case 4:
        return toolCall(
          "call-4",
          "update_todo_status",
          JSON.stringify({
            updates: [
              { id: 1, status: "cancelled" },
              { id: 2, status: "in_progress" },
            ],
          }),
        );
      case 5:
        return toolCall(
          "call-5",
          "list_directory",
          JSON.stringify({ directory: "." }),
        );
      case 6:
        return toolCall(
          "call-6",
          "update_todo_status",
          JSON.stringify({
            updates: [
              { id: 2, status: "completed" },
              { id: 3, status: "in_progress" },
            ],
          }),
        );
      default:
        return {
          message: {
            role: "assistant",
            content:
              "missing.md 不存在；我根据详细错误停止盲目重试，并改为列出当前目录。",
            toolCalls: [],
          },
        };
    }
  }
}

function toolCall(
  id: string,
  name: string,
  args: string,
): CompletionResult {
  return {
    message: {
      role: "assistant",
      content: null,
      toolCalls: [
        {
          id,
          type: "function",
          function: { name, arguments: args },
        },
      ],
    },
  };
}

function findLatestStatus(messages: AgentMessage[]): string {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (
      message?.role === "user" &&
      typeof message.content === "string" &&
      message.content.includes("<agent_status")
    ) {
      return message.content;
    }
  }
  return "（无状态栏）";
}
