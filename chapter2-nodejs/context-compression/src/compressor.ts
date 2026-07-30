import type {
  CompressionResult,
  CompressionStrategy,
  ExperimentMessage,
  SourceDocument,
  SummaryGateway,
} from "./types.js";
import { buildFullTrajectory } from "./trajectory.js";

export interface ContextCompressorOptions {
  strategy: CompressionStrategy;
  slidingWindowSize: number;
  summaryGateway: SummaryGateway;
}

export class ContextCompressor {
  readonly #strategy: CompressionStrategy;
  readonly #slidingWindowSize: number;
  readonly #summaryGateway: SummaryGateway;

  constructor(options: ContextCompressorOptions) {
    this.#strategy = options.strategy;
    this.#slidingWindowSize = options.slidingWindowSize;
    this.#summaryGateway = options.summaryGateway;
  }

  async compress(
    task: string,
    documents: SourceDocument[],
  ): Promise<CompressionResult> {
    const original = buildFullTrajectory(task, documents);
    const originalCharacters = serializedLength(original);
    let messages = structuredClone(original);
    let summaryUsage;

    if (this.#strategy === "sliding-window") {
      messages = applySlidingWindow(
        messages,
        documents,
        this.#slidingWindowSize,
      );
    }

    if (this.#strategy === "context-aware") {
      const summary = await this.#summaryGateway.summarize(task, documents);
      messages = applyCombinedSummary(messages, documents, summary.content);
      summaryUsage = summary.usage;
    }

    const requestCharacters = serializedLength(messages);
    const combined = JSON.stringify(messages);
    const allFacts = documents.flatMap((document) => document.keyFacts);
    const retainedFacts = allFacts.filter((fact) =>
      combined.includes(fact),
    ).length;

    return {
      strategy: this.#strategy,
      messages,
      originalCharacters,
      requestCharacters,
      estimatedPromptTokens: estimateTokens(combined),
      compressionRatio:
        originalCharacters === 0
          ? 0
          : 1 - requestCharacters / originalCharacters,
      retainedFacts,
      totalFacts: allFacts.length,
      ...(summaryUsage ? { summaryUsage } : {}),
    };
  }
}

function applySlidingWindow(
  messages: ExperimentMessage[],
  documents: SourceDocument[],
  windowSize: number,
): ExperimentMessage[] {
  const retainedIds = new Set(
    documents.slice(-windowSize).map((document) => document.id),
  );
  return messages.map((message) => {
    if (message.role !== "tool" || typeof message.content !== "string") {
      return message;
    }
    const toolContent = message.content;
    const source = documents.find((document) =>
      toolContent.includes(`"sourceId": "${document.id}"`),
    );
    if (!source || retainedIds.has(source.id)) {
      return message;
    }
    return {
      ...message,
      content: JSON.stringify(
        {
          sourceId: source.id,
          title: source.title,
          url: source.url,
          content:
            "[较旧工具结果已被 sliding-window 策略移除]",
        },
        null,
        2,
      ),
    };
  });
}

function applyCombinedSummary(
  messages: ExperimentMessage[],
  documents: SourceDocument[],
  summary: string,
): ExperimentMessage[] {
  let summaryWritten = false;
  return messages.map((message) => {
    if (message.role !== "tool" || typeof message.content !== "string") {
      return message;
    }
    const toolContent = message.content;
    const source = documents.find((document) =>
      toolContent.includes(`"sourceId": "${document.id}"`),
    );
    if (!source) {
      return message;
    }
    if (!summaryWritten) {
      summaryWritten = true;
      return {
        ...message,
        content: JSON.stringify(
          {
            compression: "context-aware combined summary",
            sourceCount: documents.length,
            summary,
          },
          null,
          2,
        ),
      };
    }
    return {
      ...message,
      content: JSON.stringify(
        {
          sourceId: source.id,
          url: source.url,
          content: "[内容已合并到首条压缩摘要]",
        },
        null,
        2,
      ),
    };
  });
}

function serializedLength(messages: ExperimentMessage[]): number {
  return JSON.stringify(messages).length;
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3);
}
