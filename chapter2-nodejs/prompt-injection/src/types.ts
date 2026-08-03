import type OpenAI from "openai";

export type AttackId = "direct" | "indirect" | "memory";
export type DefenseId = "d1" | "d2" | "d3" | "d4";
export type AgentMessage = OpenAI.Chat.ChatCompletionMessageParam;
export type AgentTool = OpenAI.Chat.ChatCompletionTool;

export interface DefenseConfig {
  id: DefenseId;
  name: string;
  promptHardening: boolean;
  sourceTagging: boolean;
  runtimeGuard: boolean;
}

export interface ToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export interface AssistantMessage {
  role: "assistant";
  content: string | null;
  toolCalls: ToolCall[];
}

export interface CompletionRequest {
  model: string;
  messages: AgentMessage[];
  tools: AgentTool[];
  temperature: number;
}

export interface CompletionResult {
  message: AssistantMessage;
  finishReason?: string | null;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    cachedTokens?: number;
  };
}

export interface CompletionGateway {
  complete(request: CompletionRequest): Promise<CompletionResult>;
}

export interface RecordedToolCall {
  name: string;
  args: Record<string, unknown>;
  toolCallId: string;
}

export interface BlockedToolCall extends RecordedToolCall {
  reason: string;
}

export interface AgentRunResult {
  finalText: string;
  requestedToolCalls: RecordedToolCall[];
  executedToolCalls: RecordedToolCall[];
  blockedToolCalls: BlockedToolCall[];
  messages: AgentMessage[];
  requestMessages: AgentMessage[][];
  usage: NonNullable<CompletionResult["usage"]>[];
  error?: string;
}

export interface Attack {
  id: AttackId;
  name: string;
  description: string;
  userMessages: string[];
  webpageContent: string;
  succeeded(result: AgentRunResult): boolean;
}

export interface TrialResult {
  attack: AttackId;
  attackName: string;
  defense: DefenseId;
  defenseName: string;
  trial: number;
  attackSucceeded: boolean;
  result: AgentRunResult;
  trajectoryPath?: string;
}
