import OpenAI from "openai";
import type {
  ChatCompletionAssistantMessageParam,
  ChatCompletionMessageParam,
} from "openai/resources/chat/completions";
import { skillTools, ToolDispatcher } from "./tool-dispatcher.js";

export interface AgentTrace {
  turn: number;
  phase: "request" | "assistant" | "tool";
  detail: unknown;
}

export interface AgentOptions {
  apiKey: string;
  baseURL: string;
  model: string;
  maxTurns: number;
  thinCatalog: string;
  dispatcher: ToolDispatcher;
  onTrace?: (trace: AgentTrace) => void;
}

function assistantMessage(
  message: OpenAI.Chat.Completions.ChatCompletionMessage,
): ChatCompletionAssistantMessageParam {
  return {
    role: "assistant",
    content: message.content,
    ...(message.tool_calls ? { tool_calls: message.tool_calls } : {}),
  };
}

export class AgentSkillsPptAgent {
  readonly #client: OpenAI;
  readonly #options: AgentOptions;

  constructor(options: AgentOptions) {
    this.#client = new OpenAI({
      apiKey: options.apiKey,
      baseURL: options.baseURL,
      timeout: 60_000,
      maxRetries: 3,
    });
    this.#options = options;
  }

  async run(paper: string): Promise<string> {
    const systemPrompt = `你是一个通过 Agent Skills 扩展能力的助手。

启动时你只知道下面这份薄 Skill 目录，不知道任何 Skill 的完整流程：

${this.#options.thinCatalog}

工作要求：
1. 先根据 name 与 description 判断任务是否需要某个 Skill。
2. 需要时必须先调用 read_skill。
3. 按 SKILL.md 要求，选择性调用 read_skill_file。
4. 最后调用 Skill 指定的 run_skill_script 生成真实文件。
5. 不得编造来源中不存在的数据或结论。`;

    const messages: ChatCompletionMessageParam[] = [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content:
          "请把下面论文制作成 8–12 页中文 PowerPoint。先选择 Skill，" +
          "再严格遵循其流程并生成真实文件。\n\n=== 论文 ===\n" +
          paper,
      },
    ];

    for (let turn = 1; turn <= this.#options.maxTurns; turn += 1) {
      this.#options.onTrace?.({
        turn,
        phase: "request",
        detail: structuredClone(messages),
      });
      const request = {
        model: this.#options.model,
        messages,
        tools: skillTools,
        tool_choice: "auto" as const,
        temperature: 0.2,
        enable_thinking: false,
      };
      const response = await this.#client.chat.completions.create(request);
      const modelMessage = response.choices[0]?.message;
      if (!modelMessage) throw new Error("百炼未返回 assistant 消息。");
      const assistant = assistantMessage(modelMessage);
      messages.push(assistant);
      this.#options.onTrace?.({
        turn,
        phase: "assistant",
        detail: structuredClone(assistant),
      });

      if (!assistant.tool_calls?.length) {
        return typeof assistant.content === "string" ? assistant.content : "";
      }

      for (const toolCall of assistant.tool_calls) {
        if (toolCall.type !== "function") {
          messages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: JSON.stringify({
              error: `不支持的工具调用类型：${toolCall.type}`,
            }),
          });
          continue;
        }
        const result = await this.#options.dispatcher.execute(
          toolCall.function.name,
          toolCall.function.arguments,
        );
        const toolMessage = {
          role: "tool" as const,
          tool_call_id: toolCall.id,
          content: result,
        };
        messages.push(toolMessage);
        this.#options.onTrace?.({
          turn,
          phase: "tool",
          detail: {
            name: toolCall.function.name,
            arguments: toolCall.function.arguments,
            result,
          },
        });
      }
    }
    throw new Error(
      `达到最大轮数 ${this.#options.maxTurns}，Agent 仍未完成 PPTX。`,
    );
  }
}
