import OpenAI from "openai";
import type {
  ChatCompletion,
  ChatCompletionAssistantMessageParam,
  ChatCompletionMessageParam,
  ChatCompletionToolMessageParam,
} from "openai/resources/chat/completions";
import {
  resolveProviderBackend,
  type LlmProvider,
} from "./config.js";

type JsonObject = Record<string, unknown>;
type TraceType = "thought" | "action" | "observation" | "answer";

export interface TraceStep {
  iteration: number;
  type: TraceType;
  content?: string;
  tool?: string;
  args?: JsonObject;
}

export interface OfflineDemoResult {
  question: string;
  trace: TraceStep[];
  answer: string;
}

export interface WebSearchAgentOptions {
  provider?: LlmProvider;
  apiKey?: string;
  baseURL?: string;
  model?: string;
  verbose?: boolean;
  client?: OpenAI;
}

const STEP_LABELS: Record<TraceType, readonly [string, string]> = {
  thought: ["💭", "思考"],
  action: ["🔧", "行动"],
  observation: ["👀", "观察"],
  answer: ["✅", "最终答案"],
};

export function reasoningSafeTemperature(model: string, requested = 1): number {
  const normalized = model.toLowerCase().replaceAll("/", "-");
  return normalized.includes("kimi-k3") || normalized.includes("gpt-5")
    ? 1
    : requested;
}

export function formatTraceStep(step: TraceStep, maxLength = 500): string {
  const [icon, label] = STEP_LABELS[step.type];
  const prefix = `${icon} [${step.iteration}] ${label}`;
  if (step.type === "action") {
    return `${prefix}: 调用工具 ${step.tool ?? ""}  参数=${JSON.stringify(step.args ?? {})}`;
  }
  const content = (step.content ?? "").trim();
  const rendered =
    content.length > maxLength
      ? `${content.slice(0, maxLength)}…（省略 ${content.length - maxLength} 字）`
      : content;
  return `${prefix}: ${rendered}`;
}

export function searchImpl(arguments_: JsonObject): JsonObject {
  // Moonshot 的内置搜索工具只要求原样回传调用参数。
  return arguments_;
}

export class WebSearchAgent {
  readonly provider: LlmProvider;
  readonly model: string;
  readonly usingOpenRouter: boolean;
  readonly supportsWebSearch: boolean;
  temperature = 0.6;
  maxTokens = 4096;

  private readonly client: OpenAI;
  private readonly verbose: boolean;
  private conversationHistory: ChatCompletionMessageParam[] = [];
  private trace: TraceStep[] = [];

  constructor(options: WebSearchAgentOptions = {}) {
    const backend = resolveProviderBackend(options.provider ?? "kimi", {
      ...(options.apiKey ? { apiKey: options.apiKey } : {}),
      ...(options.baseURL ? { baseURL: options.baseURL } : {}),
      ...(options.model ? { model: options.model } : {}),
    });

    this.client =
      options.client ??
      new OpenAI({ apiKey: backend.apiKey, baseURL: backend.baseURL });
    this.provider = backend.provider;
    this.model = backend.model;
    this.usingOpenRouter = backend.usingOpenRouter;
    this.supportsWebSearch = backend.supportsWebSearch;
    this.verbose = options.verbose ?? false;

    if (this.usingOpenRouter) {
      console.info(
        `改用 OpenRouter 兜底（模型: ${this.model}）。此模式不支持 Moonshot 内置 $web_search，不做实时联网搜索。`,
      );
    }
    if (this.provider === "deepseek") {
      console.info(
        "DeepSeek 官方模型 API 未启用内置实时联网搜索；当前模式仅进行模型问答。",
      );
    }
  }

  async searchAndAnswer(userQuestion: string, maxIterations = 5): Promise<string> {
    this.trace = [];
    if (this.provider === "bailian") {
      return this.runSafely(() => this.searchWithBailian(userQuestion));
    }
    if (this.provider === "deepseek") {
      return this.runSafely(() => this.answerWithDeepSeek(userQuestion));
    }
    return this.runSafely(() => this.searchWithKimi(userQuestion, maxIterations));
  }

  private async searchWithKimi(
    userQuestion: string,
    maxIterations: number,
  ): Promise<string> {
    this.conversationHistory = [
      { role: "system", content: this.getSystemPrompt() },
      { role: "user", content: userQuestion },
    ];

    let finishReason: string | null = null;
    let iteration = 0;

    while (
      (finishReason === null || finishReason === "tool_calls") &&
      iteration < maxIterations
    ) {
      iteration += 1;
      const choice = await this.chat(this.conversationHistory, true);
      finishReason = choice.finish_reason;
      const message = choice.message;
      const reasoning = (message as unknown as { reasoning_content?: string })
        .reasoning_content;
      if (reasoning) {
        this.emit({ iteration, type: "thought", content: reasoning });
      }

      if (finishReason === "tool_calls") {
        const toolCalls = message.tool_calls ?? [];
        const assistantMessage: ChatCompletionAssistantMessageParam = {
          role: "assistant",
          content: message.content ?? "",
          tool_calls: toolCalls.map((toolCall) => ({
            id: toolCall.id,
            type: "function",
            function: {
              name: toolCall.function.name,
              arguments: toolCall.function.arguments,
            },
          })),
        };
        this.conversationHistory.push(assistantMessage);

        for (const toolCall of toolCalls) {
          const name = toolCall.function.name;
          const arguments_ = JSON.parse(toolCall.function.arguments) as JsonObject;
          this.emit({ iteration, type: "action", tool: name, args: arguments_ });

          const result =
            name === "$web_search"
              ? searchImpl(arguments_)
              : `Error: unable to find tool by name '${name}'`;
          const content = JSON.stringify(result);
          this.emit({ iteration, type: "observation", tool: name, content });

          const toolMessage: ChatCompletionToolMessageParam = {
            role: "tool",
            tool_call_id: toolCall.id,
            content,
          };
          this.conversationHistory.push(toolMessage);
        }
        continue;
      }

      if (message.content) {
        const answer = message.content;
        this.emit({ iteration, type: "answer", content: answer });
        this.conversationHistory.push({ role: "assistant", content: answer });
        return answer;
      }
    }

    return iteration >= maxIterations
      ? "抱歉，搜索过程超过了最大迭代次数，请稍后重试。"
      : "抱歉，我无法获取足够的信息来回答您的问题。";
  }

  private async searchWithBailian(userQuestion: string): Promise<string> {
    this.emit({
      iteration: 1,
      type: "thought",
      content: "将问题提交给百炼 Responses API，由 qwen3.7-plus 判断并执行联网搜索。",
    });

    const request = {
      model: this.model,
      instructions: this.getSystemPrompt(),
      input: userQuestion,
      tools: [{ type: "web_search" }],
    } as unknown as OpenAI.Responses.ResponseCreateParamsNonStreaming;
    const response = await this.client.responses.create(request);
    const webSearchCalls = response.output.filter(
      (item) => item.type === "web_search_call",
    );

    for (const [index, item] of webSearchCalls.entries()) {
      this.emit({
        iteration: index + 1,
        type: "action",
        tool: "web_search",
        args: { callId: item.id },
      });
      this.emit({
        iteration: index + 1,
        type: "observation",
        tool: "web_search",
        content: `百炼托管搜索状态：${item.status}`,
      });
    }
    if (webSearchCalls.length === 0) {
      this.emit({
        iteration: 1,
        type: "observation",
        tool: "web_search",
        content: "响应中未发现 web_search_call，模型可能未执行联网搜索。",
      });
    }

    const answer = response.output_text?.trim();
    if (!answer) return "抱歉，百炼没有返回可用的文本答案。";
    this.emit({
      iteration: Math.max(1, webSearchCalls.length + 1),
      type: "answer",
      content: answer,
    });
    return answer;
  }

  private async answerWithDeepSeek(userQuestion: string): Promise<string> {
    this.conversationHistory = [
      {
        role: "system",
        content:
          "你是 DeepSeek 智能助手。请准确回答问题；如果问题依赖实时信息，明确说明当前回答未进行联网搜索。",
      },
      { role: "user", content: userQuestion },
    ];
    const choice = await this.chat(this.conversationHistory, false);
    const reasoning = (choice.message as unknown as { reasoning_content?: string })
      .reasoning_content;
    if (reasoning) {
      this.emit({ iteration: 1, type: "thought", content: reasoning });
    } else {
      this.emit({
        iteration: 1,
        type: "thought",
        content: "DeepSeek 正在基于模型知识回答；此路径没有内置实时联网搜索。",
      });
    }
    const answer = choice.message.content?.trim();
    if (!answer) return "抱歉，DeepSeek 没有返回可用的文本答案。";
    this.emit({ iteration: 1, type: "answer", content: answer });
    this.conversationHistory.push({ role: "assistant", content: answer });
    return answer;
  }

  private async runSafely(action: () => Promise<string>): Promise<string> {
    try {
      return await action();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`请求过程中出现错误: ${message}`);
      return `请求过程中出现错误: ${message}`;
    }
  }

  clearHistory(): void {
    this.conversationHistory = [];
  }

  getConversationHistory(): readonly ChatCompletionMessageParam[] {
    return structuredClone(this.conversationHistory);
  }

  getTrace(): readonly TraceStep[] {
    return structuredClone(this.trace);
  }

  setTemperature(temperature: number): boolean {
    if (temperature < 0 || temperature > 2) return false;
    this.temperature = temperature;
    return true;
  }

  private emit(step: TraceStep): void {
    this.trace.push(step);
    if (this.verbose) console.log(formatTraceStep(step));
  }

  private getTools(): JsonObject[] {
    return this.usingOpenRouter
      ? []
      : [{ type: "builtin_function", function: { name: "$web_search" } }];
  }

  private getSystemPrompt(): string {
    return `你是 Kimi，一个智能搜索助手。

请按照以下步骤处理：
1. 分析用户问题，识别关键信息需求
2. 使用 $web_search 工具搜索相关信息
3. 如果需要更多信息，可以多次调用搜索工具
4. 综合所有信息，生成准确、全面的答案

注意：
- 搜索时使用精准的关键词
- 优先获取最新、最权威的信息
- 答案要结构清晰，有理有据`;
  }

  private async chat(
    messages: ChatCompletionMessageParam[],
    includeKimiTools: boolean,
  ): Promise<ChatCompletion.Choice> {
    const tools = includeKimiTools ? this.getTools() : [];
    const request = {
        model: this.model,
        messages,
        temperature: reasoningSafeTemperature(this.model, this.temperature),
        max_tokens: this.maxTokens,
        ...(tools.length > 0 ? { tools } : {}),
        // Moonshot 的 builtin_function 是其 OpenAI 兼容扩展，SDK 联合类型尚未收录。
      } as unknown as OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming;
    const completion = await this.client.chat.completions.create(request);
    return completion.choices[0]!;
  }
}

export function runOfflineDemo(
  question = "Moonshot AI 的 Context Caching 是什么技术？",
  verbose = true,
): OfflineDemoResult {
  const trace: TraceStep[] = [
    {
      iteration: 1,
      type: "thought",
      content:
        "用户想了解 Context Caching。这是 Moonshot 的特性，我需要先搜索官方说明，确认它的定义和作用。",
    },
    {
      iteration: 1,
      type: "action",
      tool: "$web_search",
      args: { query: "Moonshot AI Context Caching 是什么" },
    },
    {
      iteration: 1,
      type: "observation",
      tool: "$web_search",
      content:
        "（示例结果）Context Caching 会把重复使用的上下文前缀缓存在服务端，后续请求可以复用，从而降低重复计算与费用。",
    },
    {
      iteration: 2,
      type: "thought",
      content: "已有定义，还需补充典型适用场景。",
    },
    {
      iteration: 2,
      type: "action",
      tool: "$web_search",
      args: { query: "Context Caching 适用场景 计费" },
    },
    {
      iteration: 2,
      type: "observation",
      tool: "$web_search",
      content:
        "（示例结果）常见于多轮对话、长文档反复问答和固定系统提示；命中缓存可降低费用与首字延迟。",
    },
    {
      iteration: 3,
      type: "answer",
      content:
        "Context Caching（上下文缓存）会将重复使用的上下文前缀缓存在服务端，后续请求复用缓存内容，从而减少计算、降低费用并加快响应。它适合长系统提示、长文档反复问答和多轮对话。（本段来自离线示例轨迹，非真实搜索结果。）",
    },
  ];

  if (verbose) trace.forEach((step) => console.log(formatTraceStep(step)));
  return {
    question,
    trace,
    answer: trace.find((step) => step.type === "answer")?.content ?? "",
  };
}
