import type OpenAI from "openai";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  formatTraceStep,
  reasoningSafeTemperature,
  runOfflineDemo,
  searchImpl,
  WebSearchAgent,
} from "./agent.js";
import {
  mapModelToOpenRouter,
  resolveLlmBackend,
  resolveProviderBackend,
} from "./config.js";

const originalEnvironment = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnvironment };
});

describe("模型与后端配置", () => {
  it("映射常见模型到 OpenRouter", () => {
    expect(mapModelToOpenRouter("gpt-5.6")).toBe("openai/gpt-5.6");
    expect(mapModelToOpenRouter("claude-sonnet-4")).toBe(
      "anthropic/claude-sonnet-4.6",
    );
    expect(mapModelToOpenRouter("kimi-k3")).toBe("moonshotai/kimi-k2.6");
    expect(mapModelToOpenRouter("vendor/model")).toBe("vendor/model");
  });

  it("优先使用主后端", () => {
    delete process.env.OPENROUTER_API_KEY;
    expect(resolveLlmBackend("moonshot-key", "https://moonshot.test/v1", "kimi-k3"))
      .toEqual({
        provider: "kimi",
        apiKey: "moonshot-key",
        baseURL: "https://moonshot.test/v1",
        model: "kimi-k3",
        usingOpenRouter: false,
        supportsWebSearch: true,
      });
  });

  it("缺少主密钥时使用 OpenRouter", () => {
    process.env.OPENROUTER_API_KEY = "openrouter-key";
    expect(resolveLlmBackend(undefined, "https://moonshot.test/v1", "kimi-k3"))
      .toMatchObject({
        apiKey: "openrouter-key",
        model: "moonshotai/kimi-k2.6",
        usingOpenRouter: true,
      });
  });

  it("解析百炼和 DeepSeek 官方后端", () => {
    expect(
      resolveProviderBackend("bailian", { apiKey: "bailian-key" }),
    ).toMatchObject({
      provider: "bailian",
      model: "qwen3.7-plus",
      supportsWebSearch: true,
    });
    expect(
      resolveProviderBackend("deepseek", { apiKey: "deepseek-key" }),
    ).toMatchObject({
      provider: "deepseek",
      model: "deepseek-v4-flash",
      supportsWebSearch: false,
    });
  });
});

describe("ReAct 辅助函数", () => {
  it("推理模型使用安全温度", () => {
    expect(reasoningSafeTemperature("kimi-k3", 0.6)).toBe(1);
    expect(reasoningSafeTemperature("openai/gpt-5.6", 0.6)).toBe(1);
    expect(reasoningSafeTemperature("deepseek-chat", 0.6)).toBe(0.6);
  });

  it("格式化行动轨迹并原样回传搜索参数", () => {
    const args = { query: "Moonshot AI" };
    expect(searchImpl(args)).toBe(args);
    expect(
      formatTraceStep({
        iteration: 1,
        type: "action",
        tool: "$web_search",
        args,
      }),
    ).toContain("调用工具 $web_search");
  });

  it("离线演示包含完整的想做看轨迹", () => {
    const result = runOfflineDemo("测试问题", false);
    expect(result.question).toBe("测试问题");
    expect(result.trace.map((step) => step.type)).toEqual([
      "thought",
      "action",
      "observation",
      "thought",
      "action",
      "observation",
      "answer",
    ]);
    expect(result.answer).toContain("Context Caching");
  });
});

describe("Provider 执行路径", () => {
  it("百炼通过 Responses API 执行 web_search", async () => {
    const create = vi.fn().mockResolvedValue({
      output: [
        { type: "web_search_call", id: "search-1", status: "completed" },
      ],
      output_text: "这是联网搜索后的答案。",
    });
    const client = { responses: { create } } as unknown as OpenAI;
    const agent = new WebSearchAgent({
      provider: "bailian",
      apiKey: "test-key",
      client,
    });

    await expect(agent.searchAndAnswer("最近的 AI 新闻")).resolves.toBe(
      "这是联网搜索后的答案。",
    );
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "qwen3.7-plus",
        tools: [{ type: "web_search" }],
      }),
    );
    expect(agent.getTrace().map((step) => step.type)).toEqual([
      "thought",
      "action",
      "observation",
      "answer",
    ]);
  });

  it("DeepSeek 只走 Chat Completions 且不伪装成联网搜索", async () => {
    const create = vi.fn().mockResolvedValue({
      choices: [
        {
          finish_reason: "stop",
          message: {
            content: "这是模型知识回答。",
            reasoning_content: "分析问题。",
          },
        },
      ],
    });
    const client = {
      chat: { completions: { create } },
    } as unknown as OpenAI;
    const agent = new WebSearchAgent({
      provider: "deepseek",
      apiKey: "test-key",
      client,
    });

    await expect(agent.searchAndAnswer("解释 ReAct")).resolves.toBe(
      "这是模型知识回答。",
    );
    expect(create).toHaveBeenCalledOnce();
    expect(agent.supportsWebSearch).toBe(false);
    expect(agent.getTrace().some((step) => step.type === "action")).toBe(false);
  });
});
