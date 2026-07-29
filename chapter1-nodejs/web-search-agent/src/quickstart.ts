import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { WebSearchAgent } from "./agent.js";
import { type LlmProvider } from "./config.js";

const COLORS = {
  cyan: "\u001b[96m",
  green: "\u001b[92m",
  blue: "\u001b[94m",
  yellow: "\u001b[93m",
  reset: "\u001b[0m",
};

function colored(text: string, color: keyof typeof COLORS): void {
  console.log(`${COLORS[color]}${text}${COLORS.reset}`);
}

const PROVIDERS: Record<
  string,
  { provider: LlmProvider; label: string; envName: string }
> = {
  "1": {
    provider: "bailian",
    label: "阿里百炼（联网搜索）",
    envName: "DASHSCOPE_API_KEY",
  },
  "2": {
    provider: "deepseek",
    label: "DeepSeek（模型问答，不联网）",
    envName: "DEEPSEEK_API_KEY",
  },
  "3": {
    provider: "kimi",
    label: "Kimi（联网搜索）",
    envName: "MOONSHOT_API_KEY",
  },
};

async function chooseProvider(
  readline: ReturnType<typeof createInterface>,
): Promise<{ provider: LlmProvider; apiKey: string } | undefined> {
  console.log("1. 阿里百炼（qwen3.7-plus，联网搜索）");
  console.log("2. DeepSeek（deepseek-v4-flash，不联网）");
  console.log("3. Kimi（kimi-k3，联网搜索）");
  const choice = (await readline.question("请选择 Provider (1-3): ")).trim();
  const selected = PROVIDERS[choice];
  if (!selected) return undefined;

  const configured =
    process.env[selected.envName] ??
    (selected.provider === "kimi" ? process.env.KIMI_API_KEY : undefined);
  if (configured) {
    colored(`✅ 已读取 ${selected.envName}`, "green");
    return { provider: selected.provider, apiKey: configured };
  }
  colored(`⚠️ 未检测到 ${selected.envName}`, "yellow");
  const answer = (
    await readline.question(`请输入 ${selected.label} API Key（输入 skip 退出）: `)
  ).trim();
  return !answer || answer.toLowerCase() === "skip"
    ? undefined
    : { provider: selected.provider, apiKey: answer };
}

async function interactive(
  agent: WebSearchAgent,
  readline: ReturnType<typeof createInterface>,
): Promise<void> {
  colored("\n💬 进入交互模式，输入 quit 退出", "cyan");
  while (true) {
    const question = (await readline.question("\n您的问题: ")).trim();
    if (["quit", "exit", "q"].includes(question.toLowerCase())) break;
    if (!question) continue;
    colored("🔍 搜索中...", "blue");
    console.log(await agent.searchAndAnswer(question));
  }
}

async function main(): Promise<void> {
  const readline = createInterface({ input: stdin, output: stdout });
  colored("\n🤖 Web Search Agent - 快速体验\n", "cyan");
  try {
    const selected = await chooseProvider(readline);
    if (!selected) {
      colored("未选择有效的 Provider。", "yellow");
      return;
    }
    const agent = new WebSearchAgent({ ...selected, verbose: true });
    await interactive(agent, readline);
  } finally {
    readline.close();
  }
}

await main();
