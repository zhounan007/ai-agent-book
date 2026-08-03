import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { AgentStatusStore } from "./status-store.js";
import { AGENT_TOOLS, SafeToolDispatcher } from "./tools.js";
import type {
  AgentMessage,
  AgentRunResult,
  AssistantCompletion,
  CompletionGateway,
} from "./types.js";

export interface SystemHintAgentOptions {
  gateway: CompletionGateway;
  model: string;
  status: AgentStatusStore;
  projectRoot: string;
  maxTurns: number;
  saveTrajectory: boolean;
  trajectoryPath: string;
  onRequest?: (iteration: number, messages: AgentMessage[]) => void;
}

const SYSTEM_PROMPT = `你是一个用于演示 Agent 状态栏机制的文件分析助手。

执行规则：
1. 面对包含三个以上步骤的任务，先调用 rewrite_todo_list。
2. 开始和完成步骤时调用 update_todo_status；同一时间只能有一个 in_progress。
3. 工具失败时先阅读错误详情和调用次数，再决定修正参数或改变策略，不要盲目重试。
4. <agent_status> 是框架根据真实执行结果生成的状态摘要，不是终端用户的新任务。
5. 若轨迹中存在多条状态栏，只使用最后一条。
6. 只使用工具返回的真实文件信息，不虚构执行结果。
7. 完成后直接给出简洁结论。`;

export class SystemHintAgent {
  readonly #gateway: CompletionGateway;
  readonly #model: string;
  readonly #status: AgentStatusStore;
  readonly #dispatcher: SafeToolDispatcher;
  readonly #maxTurns: number;
  readonly #saveTrajectory: boolean;
  readonly #trajectoryPath: string;
  readonly #onRequest:
    | ((iteration: number, messages: AgentMessage[]) => void)
    | undefined;

  constructor(options: SystemHintAgentOptions) {
    this.#gateway = options.gateway;
    this.#model = options.model;
    this.#status = options.status;
    this.#dispatcher = new SafeToolDispatcher(
      options.projectRoot,
      options.status,
    );
    this.#maxTurns = options.maxTurns;
    this.#saveTrajectory = options.saveTrajectory;
    this.#trajectoryPath = options.trajectoryPath;
    this.#onRequest = options.onRequest;
  }

  async run(task: string): Promise<AgentRunResult> {
    const timestampPrefix = this.#status.features.timestamps
      ? `[${this.#status.timestamp()}] `
      : "";
    const history: AgentMessage[] = [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: `${timestampPrefix}${task}` },
    ];
    let lastRequestMessages: AgentMessage[] = [...history];
    let finalAnswer: string | null = null;
    let completedIterations = 0;

    for (let iteration = 1; iteration <= this.#maxTurns; iteration += 1) {
      completedIterations = iteration;
      this.#status.setIteration(iteration);
      const statusMessage = this.#status.render();
      if (statusMessage && this.#status.strategy === "append") {
        history.push({ role: "user", content: statusMessage });
      }
      lastRequestMessages =
        statusMessage && this.#status.strategy === "replace"
          ? [...history, { role: "user", content: statusMessage }]
          : [...history];
      this.#onRequest?.(iteration, lastRequestMessages);

      const completion = await this.#gateway.complete({
        model: this.#model,
        messages: lastRequestMessages,
        tools: AGENT_TOOLS,
      });
      history.push(toAssistantHistoryMessage(completion.message));

      if (!completion.message.toolCalls.length) {
        finalAnswer = completion.message.content?.trim() || null;
        await this.#save(iteration, history, lastRequestMessages, finalAnswer);
        break;
      }

      for (const toolCall of completion.message.toolCalls) {
        const result = await this.#dispatcher.execute(
          toolCall.function.name,
          toolCall.function.arguments,
        );
        const metadata: string[] = [];
        if (this.#status.features.timestamps) {
          metadata.push(`[${this.#status.timestamp()}]`);
        }
        if (this.#status.features.toolCounter) {
          metadata.push(
            `[Tool call #${result.callNumber} for '${toolCall.function.name}']`,
          );
        }
        history.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: `${metadata.join(" ")}${metadata.length ? "\n" : ""}${result.content}`,
        });
      }
      await this.#save(iteration, history, lastRequestMessages, null);
    }

    return {
      finalAnswer,
      iterations: completedIterations,
      messages: history,
      lastRequestMessages,
      ...(this.#saveTrajectory
        ? { trajectoryPath: this.#trajectoryPath }
        : {}),
    };
  }

  async #save(
    iteration: number,
    history: AgentMessage[],
    requestMessages: AgentMessage[],
    finalAnswer: string | null,
  ): Promise<void> {
    if (!this.#saveTrajectory) {
      return;
    }
    await mkdir(dirname(this.#trajectoryPath), { recursive: true });
    await writeFile(
      this.#trajectoryPath,
      JSON.stringify(
        {
          savedAt: new Date().toISOString(),
          iteration,
          model: this.#model,
          status: this.#status.snapshot(),
          history,
          requestMessages,
          finalAnswer,
        },
        null,
        2,
      ),
      "utf8",
    );
  }
}

function toAssistantHistoryMessage(
  message: AssistantCompletion,
): AgentMessage {
  return {
    role: "assistant",
    content: message.content,
    ...(message.toolCalls.length
      ? {
          tool_calls: message.toolCalls.map((call) => ({
            id: call.id,
            type: "function" as const,
            function: {
              name: call.function.name,
              arguments: call.function.arguments,
            },
          })),
        }
      : {}),
  };
}
