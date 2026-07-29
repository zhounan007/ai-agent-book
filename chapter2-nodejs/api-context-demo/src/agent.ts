import OpenAI from "openai";
import type {
  ChatCompletion,
  ChatCompletionAssistantMessageParam,
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionMessageParam,
  ChatCompletionToolMessageParam,
} from "openai/resources/chat/completions";
import { executeTool, tools, type ToolContext } from "./tools.js";

export interface CompletionGateway {
  complete(
    request: ChatCompletionCreateParamsNonStreaming,
  ): Promise<ChatCompletion>;
}

export class BailianGateway implements CompletionGateway {
  readonly #client: OpenAI;

  constructor(apiKey: string, baseURL: string) {
    this.#client = new OpenAI({ apiKey, baseURL });
  }

  async complete(
    request: ChatCompletionCreateParamsNonStreaming,
  ): Promise<ChatCompletion> {
    return await this.#client.chat.completions.create(request);
  }
}

export type AgentTraceEvent =
  | {
      type: "request";
      iteration: number;
      messages: ChatCompletionMessageParam[];
    }
  | {
      type: "assistant";
      iteration: number;
      message: ChatCompletionAssistantMessageParam;
    }
  | {
      type: "tool";
      iteration: number;
      message: ChatCompletionToolMessageParam;
      name: string;
    };

export interface AgentOptions {
  model: string;
  maxIterations: number;
  toolContext: ToolContext;
  onTrace?: (event: AgentTraceEvent) => void;
}

const SYSTEM_PROMPT =
  "你是一个有帮助的助手。涉及当前时间或天气时必须使用提供的工具，" +
  "不要猜测实时信息。拿到全部工具结果后，用中文简洁回答。";

function cloneMessages(
  messages: ChatCompletionMessageParam[],
): ChatCompletionMessageParam[] {
  return structuredClone(messages);
}

function toAssistantMessage(
  message: ChatCompletion["choices"][number]["message"],
): ChatCompletionAssistantMessageParam {
  return {
    role: "assistant",
    content: message.content,
    ...(message.tool_calls ? { tool_calls: message.tool_calls } : {}),
  };
}

function readAssistantText(
  content: ChatCompletionAssistantMessageParam["content"],
): string {
  if (typeof content === "string") return content;
  if (!content) return "";
  return content
    .map((part) => ("text" in part ? part.text : part.refusal))
    .join("");
}

export class ApiContextAgent {
  readonly #gateway: CompletionGateway;
  readonly #options: AgentOptions;

  constructor(gateway: CompletionGateway, options: AgentOptions) {
    this.#gateway = gateway;
    this.#options = options;
  }

  async runSingleTurn(question: string): Promise<string> {
    const messages: ChatCompletionMessageParam[] = [
      {
        role: "system",
        content: "你是一个有帮助的助手，请用中文回答。",
      },
      { role: "user", content: question },
    ];
    this.#options.onTrace?.({
      type: "request",
      iteration: 1,
      messages: cloneMessages(messages),
    });

    const response = await this.#gateway.complete({
      model: this.#options.model,
      messages,
    });
    const assistant = toAssistantMessage(response.choices[0]!.message);
    this.#options.onTrace?.({
      type: "assistant",
      iteration: 1,
      message: structuredClone(assistant),
    });
    return readAssistantText(assistant.content);
  }

  async runWithTools(question: string): Promise<string> {
    const messages: ChatCompletionMessageParam[] = [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: question },
    ];

    for (
      let iteration = 1;
      iteration <= this.#options.maxIterations;
      iteration += 1
    ) {
      this.#options.onTrace?.({
        type: "request",
        iteration,
        messages: cloneMessages(messages),
      });

      const response = await this.#gateway.complete({
        model: this.#options.model,
        messages,
        tools,
        tool_choice: "auto",
      });
      const assistant = toAssistantMessage(response.choices[0]!.message);
      messages.push(assistant);
      this.#options.onTrace?.({
        type: "assistant",
        iteration,
        message: structuredClone(assistant),
      });

      if (!assistant.tool_calls?.length) {
        return readAssistantText(assistant.content);
      }

      const results = await Promise.all(
        assistant.tool_calls.map(async (toolCall) => {
          if (toolCall.type !== "function") {
            return {
              name: toolCall.type,
              message: {
                role: "tool" as const,
                tool_call_id: toolCall.id,
                content: JSON.stringify({
                  error: `不支持的工具调用类型：${toolCall.type}`,
                }),
              },
            };
          }
          return {
            name: toolCall.function.name,
            message: {
              role: "tool" as const,
              tool_call_id: toolCall.id,
              content: await executeTool(
                toolCall.function.name,
                toolCall.function.arguments,
                this.#options.toolContext,
              ),
            },
          };
        }),
      );

      for (const result of results) {
        messages.push(result.message);
        this.#options.onTrace?.({
          type: "tool",
          iteration,
          message: structuredClone(result.message),
          name: result.name,
        });
      }
    }

    throw new Error(
      `达到最大模型调用次数 ${this.#options.maxIterations}，Agent 仍未生成最终回复。`,
    );
  }
}
