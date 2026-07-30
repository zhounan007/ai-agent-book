import { describe, expect, it } from "vitest";
import { ContextCompressor } from "../src/compressor.js";
import { createDemoCorpus } from "../src/corpus.js";
import { OfflineSummaryGateway } from "../src/offline-gateway.js";

const task = "对比 2024 到 2026 的版本演进";
const documents = createDemoCorpus();
const summaryGateway = new OfflineSummaryGateway();

describe("ContextCompressor", () => {
  it("none 保留完整上下文和全部事实", async () => {
    const result = await compressor("none").compress(
      task,
      documents,
    );

    expect(result.requestCharacters).toBe(result.originalCharacters);
    expect(result.compressionRatio).toBe(0);
    expect(result.retainedFacts).toBe(result.totalFacts);
  });

  it("sliding-window 缩短上下文但丢失较早资料", async () => {
    const result = await compressor("sliding-window").compress(
      task,
      documents,
    );

    expect(result.requestCharacters).toBeLessThan(
      result.originalCharacters,
    );
    expect(result.retainedFacts).toBeLessThan(result.totalFacts);
    expect(JSON.stringify(result.messages)).not.toContain(
      "Northstar 2024 的核心能力是 ContextCore。",
    );
    expect(JSON.stringify(result.messages)).toContain(
      "Northstar 2026 引入 StateRail 状态栏。",
    );
  });

  it("context-aware 压缩上下文并保留全部关键事实和来源", async () => {
    const result = await compressor("context-aware").compress(
      task,
      documents,
    );
    const content = JSON.stringify(result.messages);

    expect(result.requestCharacters).toBeLessThan(
      result.originalCharacters,
    );
    expect(result.retainedFacts).toBe(result.totalFacts);
    expect(content).toContain(
      "[来源: local://northstar/release-2024]",
    );
    expect(result.summaryUsage?.promptTokens).toBeGreaterThan(0);
  });
});

function compressor(
  strategy: "none" | "sliding-window" | "context-aware",
) {
  return new ContextCompressor({
    strategy,
    slidingWindowSize: 2,
    summaryGateway,
  });
}
