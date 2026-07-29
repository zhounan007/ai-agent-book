import { parseArgs } from "node:util";
import {
  ApiContextAgent,
  BailianGateway,
  type AgentTraceEvent,
} from "./agent.js";
import { loadConfig } from "./config.js";

type DemoMode = "single" | "tools";

const DEFAULT_QUESTIONS: Record<DemoMode, string> = {
  single: "你好，你是谁？",
  tools: "北京市海淀区现在几点，天气怎么样？",
};

const HELP = `第二章 2.2：OpenAI API 上下文与工具调用 Demo

用法:
  npm start -- [single|tools] [问题] [选项]

模式:
  single    单轮对话，展示 system/user/assistant 消息
  tools     工具调用循环，展示 assistant/tool 消息和上下文增长（默认）

选项:
  --quiet   只输出最终回答
  --help    显示帮助

示例:
  npm run single
  npm run demo
  npm start -- tools "上海市浦东新区现在几点，天气如何？"`;

function printTrace(event: AgentTraceEvent): void {
  if (event.type === "request") {
    console.log(`\n━━ 第 ${event.iteration} 次模型请求：messages ━━`);
    console.log(JSON.stringify(event.messages, null, 2));
    return;
  }
  if (event.type === "assistant") {
    console.log(`\n━━ 第 ${event.iteration} 次模型响应：assistant ━━`);
    console.log(JSON.stringify(event.message, null, 2));
    return;
  }
  console.log(`\n━━ 应用执行工具：${event.name} ━━`);
  console.log(JSON.stringify(event.message, null, 2));
}

function parseCli(argv: string[]): {
  mode: DemoMode;
  question: string;
  quiet: boolean;
  help: boolean;
} {
  const parsed = parseArgs({
    args: argv,
    allowPositionals: true,
    strict: true,
    options: {
      quiet: { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
  });
  const [rawMode, ...questionParts] = parsed.positionals;
  const mode = rawMode ?? "tools";
  if (mode !== "single" && mode !== "tools") {
    throw new Error("模式只能是 single 或 tools。");
  }
  return {
    mode,
    question: questionParts.join(" ").trim() || DEFAULT_QUESTIONS[mode],
    quiet: parsed.values.quiet,
    help: parsed.values.help,
  };
}

export async function main(argv = process.argv.slice(2)): Promise<number> {
  let cli: ReturnType<typeof parseCli>;
  try {
    cli = parseCli(argv);
  } catch (error) {
    console.error(`参数错误：${error instanceof Error ? error.message : String(error)}`);
    return 2;
  }

  if (cli.help) {
    console.log(HELP);
    return 0;
  }

  try {
    const config = loadConfig();
    const gateway = new BailianGateway(
      config.dashscopeApiKey,
      config.dashscopeBaseURL,
    );
    const agent = new ApiContextAgent(gateway, {
      model: config.model,
      maxIterations: config.maxIterations,
      toolContext: {
        baiduMapAK: config.baiduMapAK,
        baiduWeatherBaseURL: config.baiduWeatherBaseURL,
      },
      ...(!cli.quiet ? { onTrace: printTrace } : {}),
    });

    console.log(`模型：${config.model}`);
    console.log(`问题：${cli.question}`);
    const answer =
      cli.mode === "single"
        ? await agent.runSingleTurn(cli.question)
        : await agent.runWithTools(cli.question);
    console.log(`\n━━ 最终回答 ━━\n${answer}`);
    return 0;
  } catch (error) {
    console.error(`运行失败：${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = await main();
}
