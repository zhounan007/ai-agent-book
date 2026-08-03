import OpenAI from "openai";
import type {
  AssistantMessage,
  CompletionGateway,
  CompletionRequest,
  CompletionResult,
} from "./types.js";

export class BailianGateway implements CompletionGateway {
  readonly #client: OpenAI;

  constructor(apiKey: string, baseUrl: string) {
    this.#client = new OpenAI({ apiKey, baseURL: baseUrl });
  }

  async complete(
    request: CompletionRequest,
  ): Promise<CompletionResult> {
    const response = await this.#client.chat.completions.create({
      model: request.model,
      messages: request.messages,
      tools: request.tools,
      tool_choice: "auto",
      temperature: request.temperature,
    });
    const choice = response.choices[0];
    if (!choice) {
      throw new Error("百炼响应中没有 choices[0]。");
    }
    const usage = normalizeUsage(response.usage);
    return {
      message: normalizeAssistantMessage(choice.message),
      finishReason: choice.finish_reason,
      ...(usage ? { usage } : {}),
    };
  }
}

function normalizeAssistantMessage(
  value: OpenAI.Chat.Completions.ChatCompletionMessage,
): AssistantMessage {
  const toolCalls = (value.tool_calls ?? []).map((call, index) => {
    if (
      call.type !== "function" ||
      !call.id ||
      !call.function.name ||
      typeof call.function.arguments !== "string"
    ) {
      throw new Error(
        `assistant.tool_calls[${index}] 结构不合法。`,
      );
    }
    return {
      id: call.id,
      type: "function" as const,
      function: {
        name: call.function.name,
        arguments: call.function.arguments,
      },
    };
  });
  return {
    role: "assistant",
    content: value.content,
    toolCalls,
  };
}

function normalizeUsage(
  usage: OpenAI.Completions.CompletionUsage | undefined,
) {
  if (!usage) {
    return undefined;
  }
  const details = usage.prompt_tokens_details as
    | { cached_tokens?: number }
    | undefined;
  return {
    promptTokens: usage.prompt_tokens,
    completionTokens: usage.completion_tokens,
    ...(details?.cached_tokens !== undefined
      ? { cachedTokens: details.cached_tokens }
      : {}),
  };
}
