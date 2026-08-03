import { describe, expect, it } from "vitest";
import { SystemHintAgent } from "../src/agent.js";
import { AgentStatusStore } from "../src/status-store.js";
import type {
  AgentMessage,
  CompletionGateway,
  CompletionRequest,
  CompletionResult,
  StatusUpdateStrategy,
} from "../src/types.js";

const features = {
  timestamps: false,
  toolCounter: true,
  todoList: true,
  detailedErrors: true,
  systemState: true,
};

describe("SystemHintAgent", () => {
  it.each([
    ["replace", false],
    ["append", true],
  ] as const)(
    "%s 策略按预期处理状态消息",
    async (strategy, statusPersistsInHistory) => {
      const requests: AgentMessage[][] = [];
      const agent = createAgent(strategy, requests);
      const result = await agent.run("查看状态");

      expect(findStatus(requests[0] ?? [])).toBeTruthy();
      expect(findStatus(result.messages)).toBe(statusPersistsInHistory);
      expect(result.finalAnswer).toBe("完成");
    },
  );

  it("none 策略不注入状态栏", async () => {
    const requests: AgentMessage[][] = [];
    const result = await createAgent("none", requests).run("查看状态");

    expect(findStatus(requests[0] ?? [])).toBe(false);
    expect(findStatus(result.messages)).toBe(false);
  });
});

function createAgent(
  strategy: StatusUpdateStrategy,
  requests: AgentMessage[][],
): SystemHintAgent {
  const root = process.cwd();
  const status = new AgentStatusStore({
    strategy,
    features,
    initialDirectory: root,
    now: () => new Date("2026-07-29T02:30:00.000Z"),
  });
  return new SystemHintAgent({
    gateway: new FinalGateway(),
    model: "test-model",
    status,
    projectRoot: root,
    maxTurns: 2,
    saveTrajectory: false,
    trajectoryPath: "unused.json",
    onRequest: (_iteration, messages) => requests.push(messages),
  });
}

class FinalGateway implements CompletionGateway {
  async complete(_request: CompletionRequest): Promise<CompletionResult> {
    return {
      message: {
        role: "assistant",
        content: "完成",
        toolCalls: [],
      },
    };
  }
}

function findStatus(messages: AgentMessage[]): boolean {
  return messages.some(
    (message) =>
      message.role === "user" &&
      typeof message.content === "string" &&
      message.content.includes("<agent_status"),
  );
}
