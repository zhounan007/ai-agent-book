import type OpenAI from "openai";

export type CompressionStrategy =
  | "none"
  | "sliding-window"
  | "context-aware";

export type ExperimentMessage =
  OpenAI.Chat.ChatCompletionMessageParam;

export interface SourceDocument {
  id: string;
  title: string;
  url: string;
  content: string;
  keyFacts: string[];
}

export interface ModelUsage {
  promptTokens?: number;
  completionTokens?: number;
  cachedTokens?: number;
}

export interface ModelResponse {
  content: string;
  finishReason?: string | null;
  usage?: ModelUsage;
}

export interface ModelGateway {
  complete(messages: ExperimentMessage[]): Promise<ModelResponse>;
}

export interface SummaryGateway {
  summarize(
    task: string,
    documents: SourceDocument[],
  ): Promise<ModelResponse>;
}

export interface CompressionResult {
  strategy: CompressionStrategy;
  messages: ExperimentMessage[];
  originalCharacters: number;
  requestCharacters: number;
  estimatedPromptTokens: number;
  compressionRatio: number;
  retainedFacts: number;
  totalFacts: number;
  summaryUsage?: ModelUsage;
}

export interface StrategyRunResult extends CompressionResult {
  answer: string;
  answerFactCoverage: number;
  answerUsage?: ModelUsage;
  durationMs: number;
  trajectoryPath?: string;
}
