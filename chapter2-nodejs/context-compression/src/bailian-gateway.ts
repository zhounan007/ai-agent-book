import OpenAI from "openai";
import type {
  ExperimentMessage,
  ModelGateway,
  ModelResponse,
  SourceDocument,
  SummaryGateway,
} from "./types.js";

export class BailianGateway implements ModelGateway, SummaryGateway {
  readonly #client: OpenAI;
  readonly #model: string;

  constructor(apiKey: string, baseUrl: string, model: string) {
    this.#client = new OpenAI({ apiKey, baseURL: baseUrl });
    this.#model = model;
  }

  async complete(
    messages: ExperimentMessage[],
  ): Promise<ModelResponse> {
    const response = await this.#client.chat.completions.create({
      model: this.#model,
      messages,
      temperature: 0.2,
    });
    const choice = response.choices[0];
    if (!choice) {
      throw new Error("百炼响应中没有 choices[0]。");
    }
    const usage = normalizeUsage(response.usage);
    return {
      content: choice.message.content?.trim() || "",
      finishReason: choice.finish_reason,
      ...(usage ? { usage } : {}),
    };
  }

  async summarize(
    task: string,
    documents: SourceDocument[],
  ): Promise<ModelResponse> {
    const sources = documents
      .map(
        (document) =>
          `<source id="${document.id}" url="${document.url}">\n${document.content}\n</source>`,
      )
      .join("\n\n");
    return this.complete([
      {
        role: "system",
        content: `你是上下文压缩器。请根据当前任务压缩资料，而不是回答任务。
必须保留所有版本号、能力名称、token 上限、迁移要求、阈值、否定关系和来源 URL。
删除重复背景。每条事实尽量保留原句，并在段落末尾写 [来源: URL]。`,
      },
      {
        role: "user",
        content: `当前任务：${task}\n\n待压缩资料：\n${sources}`,
      },
    ]);
  }
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
