import { writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { WebSearchAgent, runOfflineDemo, type OfflineDemoResult } from "./agent.js";
import {
  config,
  getProviderDefaults,
  type LlmProvider,
} from "./config.js";

interface CliOptions {
  provider: LlmProvider | "offline-demo";
  model: string;
  maxSteps: number;
  baseURL: string;
  apiKey?: string;
  output?: string;
  quiet: boolean;
  help: boolean;
}

const HELP = `Web Search Agent —— 支持百炼联网搜索、Kimi 搜索与 DeepSeek 问答。

用法:
  npm start -- [问题] [选项]

选项:
  --provider <提供商>            bailian、deepseek、kimi 或 offline-demo
  --model <模型>                 覆盖提供商的默认模型
  --max-steps <数字>             最大 ReAct 迭代次数（默认 5）
  --base-url <URL>               API 基础 URL
  --api-key <KEY>                API Key（推荐使用对应环境变量）
  --output, -o <文件>            保存问题、轨迹和答案为 JSON
  --quiet                        不实时打印 ReAct 轨迹
  --help, -h                     显示帮助

示例:
  npm start -- "近期 AI 新闻" --provider bailian
  npm start -- "解释 Transformer" --provider deepseek
  npm start -- --provider offline-demo
  npm start -- "比特币现价" --provider bailian --output result.json`;

export function parseCliArgs(argv: string[]): { question: string; options: CliOptions } {
  const parsed = parseArgs({
    args: argv,
    allowPositionals: true,
    strict: true,
    options: {
      provider: { type: "string", default: "kimi" },
      model: { type: "string" },
      "max-steps": {
        type: "string",
        default: String(config.maxSearchIterations),
      },
      "base-url": { type: "string" },
      "api-key": { type: "string" },
      output: { type: "string", short: "o" },
      quiet: { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
  });

  if (
    !["kimi", "bailian", "deepseek", "offline-demo"].includes(
      parsed.values.provider,
    )
  ) {
    throw new Error(
      "--provider 只能是 bailian、deepseek、kimi 或 offline-demo",
    );
  }
  const maxSteps = Number.parseInt(parsed.values["max-steps"], 10);
  if (!Number.isInteger(maxSteps) || maxSteps < 1) {
    throw new Error("--max-steps 必须是正整数");
  }

  const provider = parsed.values.provider as CliOptions["provider"];
  const defaults =
    provider === "offline-demo"
      ? getProviderDefaults("kimi")
      : getProviderDefaults(provider);
  const optional = {
    ...(parsed.values["api-key"] ? { apiKey: parsed.values["api-key"] } : {}),
    ...(parsed.values.output ? { output: parsed.values.output } : {}),
  };
  return {
    question: parsed.positionals.join(" ").trim(),
    options: {
      provider,
      model: parsed.values.model ?? defaults.model,
      maxSteps,
      baseURL: parsed.values["base-url"] ?? defaults.baseURL,
      quiet: parsed.values.quiet,
      help: parsed.values.help,
      ...optional,
    },
  };
}

async function saveOutput(path: string, payload: OfflineDemoResult): Promise<void> {
  await writeFile(path, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.log(`\n💾 结果已保存到: ${path}`);
}

async function runSingleQuestion(
  agent: WebSearchAgent,
  question: string,
  options: CliOptions,
): Promise<void> {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`🤖 Web Search Agent · ${options.provider}`);
  console.log("=".repeat(60));
  console.log(`问题: ${question}`);
  console.log("-".repeat(60));
  console.log("🔍 ReAct 轨迹（想 → 做 → 看）:\n");

  const answer = await agent.searchAndAnswer(question, options.maxSteps);
  console.log(`\n📝 答案:\n${"-".repeat(60)}\n${answer}`);
  console.log(`${"=".repeat(60)}\n`);
  if (options.output) {
    await saveOutput(options.output, {
      question,
      trace: [...agent.getTrace()],
      answer,
    });
  }
}

async function runInteractiveMode(
  agent: WebSearchAgent,
  options: CliOptions,
): Promise<void> {
  const readline = createInterface({ input: stdin, output: stdout });
  console.log(`\n🤖 Web Search Agent · ${options.provider} - 交互模式`);
  console.log("输入问题；输入 quit/exit 退出，输入 clear 清空历史。\n");

  try {
    while (true) {
      const question = (await readline.question("您的问题: ")).trim();
      if (["quit", "exit", "q"].includes(question.toLowerCase())) break;
      if (question.toLowerCase() === "clear") {
        agent.clearHistory();
        console.log("✅ 对话历史已清空\n");
        continue;
      }
      if (!question) {
        console.log("❌ 请输入一个问题\n");
        continue;
      }
      await runSingleQuestion(agent, question, options);
    }
  } finally {
    readline.close();
  }
}

export async function main(argv = process.argv.slice(2)): Promise<number> {
  let parsed: ReturnType<typeof parseCliArgs>;
  try {
    parsed = parseCliArgs(argv);
  } catch (error) {
    console.error(`参数错误：${error instanceof Error ? error.message : String(error)}`);
    console.error("使用 --help 查看帮助。");
    return 2;
  }

  const { question, options } = parsed;
  if (options.help) {
    console.log(HELP);
    return 0;
  }

  if (options.provider === "offline-demo") {
    const demoQuestion = question || "Moonshot AI 的 Context Caching 是什么技术？";
    console.log("\n🧪 离线演示模式（示例轨迹，非真实搜索结果）\n");
    const result = runOfflineDemo(demoQuestion, !options.quiet);
    console.log(`\n📝 答案:\n${result.answer}\n`);
    if (options.output) await saveOutput(options.output, result);
    return 0;
  }

  try {
    const agent = new WebSearchAgent({
      provider: options.provider,
      ...(options.apiKey ? { apiKey: options.apiKey } : {}),
      baseURL: options.baseURL,
      model: options.model,
      verbose: !options.quiet,
    });
    if (question) await runSingleQuestion(agent, question, options);
    else await runInteractiveMode(agent, options);
    return 0;
  } catch (error) {
    console.error(`Agent 初始化失败：${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = await main();
}
