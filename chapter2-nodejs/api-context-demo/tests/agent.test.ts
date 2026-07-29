import { describe, expect, it } from "vitest";
import type {
  ChatCompletion,
  ChatCompletionCreateParamsNonStreaming,
} from "openai/resources/chat/completions";
import {
  ApiContextAgent,
  type AgentTraceEvent,
  type CompletionGateway,
} from "../src/agent.js";

function completion(
  message: ChatCompletion["choices"][number]["message"],
  finishReason: "stop" | "tool_calls",
): ChatCompletion {
  return {
    id: "chatcmpl-test",
    object: "chat.completion",
    created: 0,
    model: "qwen3.7-plus",
    choices: [
      {
        index: 0,
        finish_reason: finishReason,
        logprobs: null,
        message,
      },
    ],
    usage: {
      prompt_tokens: 1,
      completion_tokens: 1,
      total_tokens: 2,
    },
  };
}

class FakeGateway implements CompletionGateway {
  readonly requests: ChatCompletionCreateParamsNonStreaming[] = [];
  readonly #responses: ChatCompletion[];

  constructor(responses: ChatCompletion[]) {
    this.#responses = [...responses];
  }

  async complete(
    request: ChatCompletionCreateParamsNonStreaming,
  ): Promise<ChatCompletion> {
    this.requests.push(structuredClone(request));
    const response = this.#responses.shift();
    if (!response) throw new Error("FakeGateway 没有更多响应。");
    return response;
  }
}

describe("ApiContextAgent", () => {
  it("appends assistant and tool messages before the second model call", async () => {
    const gateway = new FakeGateway([
      completion(
        {
          role: "assistant",
          content: null,
          refusal: null,
          tool_calls: [
            {
              id: "call-time",
              type: "function",
              function: {
                name: "get_current_time",
                arguments: '{"timezone":"Asia/Shanghai"}',
              },
            },
            {
              id: "call-weather",
              type: "function",
              function: {
                name: "get_current_weather",
                arguments:
                  '{"province":"北京市","city":"北京市","district":"海淀区"}',
              },
            },
          ],
        },
        "tool_calls",
      ),
      completion(
        {
          role: "assistant",
          content: "北京现在是中午，海淀区天气多云，31℃。",
          refusal: null,
        },
        "stop",
      ),
    ]);
    const traces: AgentTraceEvent[] = [];
    const fetchImpl = async () =>
      new Response(
        JSON.stringify({
          status: 0,
          result: {
            location: { name: "海淀区", id: "110108" },
            now: { temp: 31, text: "多云", rh: 62 },
          },
        }),
        { status: 200 },
      );
    const agent = new ApiContextAgent(gateway, {
      model: "qwen3.7-plus",
      maxIterations: 5,
      toolContext: {
        baiduMapAK: "test-ak",
        baiduWeatherBaseURL: "https://api.map.baidu.com/weather/v1/",
        fetchImpl,
        now: new Date("2026-07-27T04:00:00.000Z"),
      },
      onTrace: (event) => traces.push(event),
    });

    const answer = await agent.runWithTools(
      "北京市海淀区现在几点，天气怎么样？",
    );

    expect(answer).toBe("北京现在是中午，海淀区天气多云，31℃。");
    expect(gateway.requests).toHaveLength(2);
    expect(gateway.requests[0]?.messages).toHaveLength(2);
    expect(gateway.requests[1]?.messages.map((message) => message.role)).toEqual(
      ["system", "user", "assistant", "tool", "tool"],
    );
    expect(traces.filter((event) => event.type === "tool")).toHaveLength(2);
  });

  it("stops with an error when the model never produces a final answer", async () => {
    const toolCallResponse = completion(
      {
        role: "assistant",
        content: null,
        refusal: null,
        tool_calls: [
          {
            id: "call-time",
            type: "function",
            function: {
              name: "get_current_time",
              arguments: '{"timezone":"Asia/Shanghai"}',
            },
          },
        ],
      },
      "tool_calls",
    );
    const gateway = new FakeGateway([toolCallResponse, toolCallResponse]);
    const agent = new ApiContextAgent(gateway, {
      model: "qwen3.7-plus",
      maxIterations: 2,
      toolContext: {
        baiduMapAK: "test-ak",
        baiduWeatherBaseURL: "https://api.map.baidu.com/weather/v1/",
      },
    });

    await expect(agent.runWithTools("现在几点？")).rejects.toThrow(
      "达到最大模型调用次数 2",
    );
  });
});
