import type OpenAI from "openai";

export type AgentMessage = OpenAI.Chat.ChatCompletionMessageParam;
export type AgentTool = OpenAI.Chat.ChatCompletionTool;
export type StatusUpdateStrategy = "none" | "replace" | "append";
export type TodoStatus =
  | "pending"
  | "in_progress"
  | "completed"
  | "cancelled";

export interface TodoItem {
  id: number;
  content: string;
  status: TodoStatus;
  createdAt: string;
  updatedAt?: string;
}

export interface AssistantToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export interface AssistantCompletion {
  role: "assistant";
  content: string | null;
  toolCalls: AssistantToolCall[];
}

export interface CompletionRequest {
  model: string;
  messages: AgentMessage[];
  tools: AgentTool[];
}

export interface CompletionResult {
  message: AssistantCompletion;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    cachedTokens?: number;
  };
}

export interface CompletionGateway {
  complete(request: CompletionRequest): Promise<CompletionResult>;
}

export interface AgentRunResult {
  finalAnswer: string | null;
  iterations: number;
  messages: AgentMessage[];
  lastRequestMessages: AgentMessage[];
  trajectoryPath?: string;
}
