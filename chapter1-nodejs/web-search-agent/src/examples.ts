import { writeFile } from "node:fs/promises";
import { WebSearchAgent } from "./agent.js";
import type { LlmProvider } from "./config.js";

export interface BatchResult {
  question: string;
  answer: string;
  status: "success" | "error";
}

export class AdvancedWebSearchAgent extends WebSearchAgent {
  async batchSearch(questions: string[]): Promise<BatchResult[]> {
    const results: BatchResult[] = [];
    for (const question of questions) {
      try {
        results.push({
          question,
          answer: await this.searchAndAnswer(question),
          status: "success",
        });
      } catch (error) {
        results.push({
          question,
          answer: error instanceof Error ? error.message : String(error),
          status: "error",
        });
      }
      this.clearHistory();
    }
    return results;
  }

  searchWithContext(question: string, context: string): Promise<string> {
    return this.searchAndAnswer(
      `背景信息：${context}\n\n基于上述背景，请回答以下问题：\n${question}`,
    );
  }

  comparativeSearch(items: string[], aspect: string): Promise<string> {
    return this.searchAndAnswer(
      `请搜索并比较 ${items.join("、")} 在 ${aspect} 方面的差异和优劣`,
    );
  }

  async factCheck(statement: string): Promise<{
    statement: string;
    isTrue: boolean;
    explanation: string;
  }> {
    const explanation = await this.searchAndAnswer(
      `请验证以下陈述的真实性：\n"${statement}"\n\n请给出结论、事实证据和信息来源。`,
    );
    return {
      statement,
      isTrue: explanation.slice(0, 100).includes("真"),
      explanation,
    };
  }
}

async function main(): Promise<void> {
  const requestedProvider = process.env.EXAMPLE_PROVIDER ?? "bailian";
  if (!["bailian", "deepseek", "kimi"].includes(requestedProvider)) {
    throw new Error("EXAMPLE_PROVIDER 只能是 bailian、deepseek 或 kimi");
  }
  const provider = requestedProvider as LlmProvider;
  const agent = new AdvancedWebSearchAgent({
    provider,
    verbose: true,
  });
  const questions = [
    "React 和 Vue 的主要区别是什么？",
    "如何开始学习人工智能？",
  ];
  const results = await agent.batchSearch(questions);
  console.log(results);
  await writeFile("research_report.json", `${JSON.stringify(results, null, 2)}\n`);
  console.log("✅ 示例结果已保存到 research_report.json");
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
