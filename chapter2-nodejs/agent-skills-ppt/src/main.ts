import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { AgentSkillsPptAgent, type AgentTrace } from "./agent.js";
import { loadOnlineConfig } from "./config.js";
import {
  DEFAULT_OUTLINE,
  DEFAULT_OUTPUT,
  DEFAULT_PAPER,
} from "./project-paths.js";
import { SkillRegistry } from "./skill-registry.js";
import {
  ToolDispatcher,
  type DisclosureEvent,
} from "./tool-dispatcher.js";

const HELP = `实验 2-6：百炼 + TypeScript Agent Skills PPT

用法:
  npm start -- [选项]

选项:
  --offline             不调用百炼，确定性回放三层渐进式披露
  --paper <路径>        在线模式输入论文，默认 papers/sample-paper.md
  --outline <路径>      离线模式输入大纲，默认 papers/sample-outline.json
  --output, -o <路径>   输出 PPTX，默认 output/presentation.pptx
  --model <名称>        在线模式覆盖 DASHSCOPE_MODEL
  --max-turns <数字>    在线模式最大 Agent 轮数
  --quiet               不打印完整模型轨迹
  --help, -h            显示帮助`;

interface CliOptions {
  offline: boolean;
  paper: string;
  outline: string;
  output: string;
  model?: string;
  maxTurns?: number;
  quiet: boolean;
  help: boolean;
}

function parseCli(argv: string[]): CliOptions {
  const parsed = parseArgs({
    args: argv,
    strict: true,
    options: {
      offline: { type: "boolean", default: false },
      paper: { type: "string", default: DEFAULT_PAPER },
      outline: { type: "string", default: DEFAULT_OUTLINE },
      output: { type: "string", short: "o", default: DEFAULT_OUTPUT },
      model: { type: "string" },
      "max-turns": { type: "string" },
      quiet: { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
  });
  const rawMaxTurns = parsed.values["max-turns"];
  const maxTurns = rawMaxTurns
    ? Number.parseInt(rawMaxTurns, 10)
    : undefined;
  if (maxTurns !== undefined && (!Number.isInteger(maxTurns) || maxTurns < 1)) {
    throw new Error("--max-turns 必须是正整数。");
  }
  return {
    offline: parsed.values.offline,
    paper: resolve(parsed.values.paper),
    outline: resolve(parsed.values.outline),
    output: resolve(parsed.values.output),
    quiet: parsed.values.quiet,
    help: parsed.values.help,
    ...(parsed.values.model ? { model: parsed.values.model } : {}),
    ...(maxTurns !== undefined ? { maxTurns } : {}),
  };
}

function printDisclosure(event: DisclosureEvent): void {
  if (event.level === 2) {
    console.log(
      `\n[第二层] read_skill(${event.name})：加载 ${event.characters} 字符`,
    );
    return;
  }
  if (event.level === 3) {
    console.log(
      `\n[第三层] read_skill_file(${event.name}, ${event.path})：` +
        `加载 ${event.characters} 字符`,
    );
    return;
  }
  console.log(
    `\n[执行] ${event.name}/${event.script}：生成 ${event.result.slideCount} 页`,
  );
  console.log(`PPTX: ${event.result.path}`);
  console.log(`PDF: ${event.result.pdfPath}`);
  console.log(`预览: ${event.result.previewDirectory}`);
  console.log(`Montage: ${event.result.montagePath}`);
  console.log(`布局报告: ${event.result.layoutReportPath}`);
}

function printTrace(trace: AgentTrace): void {
  const label =
    trace.phase === "request"
      ? "模型请求"
      : trace.phase === "assistant"
        ? "模型响应"
        : "工具结果";
  console.log(`\n━━ 第 ${trace.turn} 轮 · ${label} ━━`);
  console.log(JSON.stringify(trace.detail, null, 2));
}

async function runOffline(
  registry: SkillRegistry,
  dispatcher: ToolDispatcher,
  outlinePath: string,
): Promise<void> {
  console.log("\n【离线模式】不调用百炼，固定回放三层渐进式披露。");
  console.log("\n[第一层] Agent 启动时只看到薄目录：");
  console.log(registry.thinCatalog());

  await dispatcher.execute("read_skill", JSON.stringify({ name: "pptx" }));
  await dispatcher.execute(
    "read_skill_file",
    JSON.stringify({ name: "pptx", path: "reference.md" }),
  );
  const payload = JSON.parse(await readFile(outlinePath, "utf8")) as unknown;
  const result = await dispatcher.execute(
    "run_skill_script",
    JSON.stringify({
      name: "pptx",
      script: "generate-pptx",
      payload,
    }),
  );
  const parsed = JSON.parse(result) as { error?: string };
  if (parsed.error) throw new Error(parsed.error);
}

export async function main(argv = process.argv.slice(2)): Promise<number> {
  let cli: CliOptions;
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
    const registry = new SkillRegistry();
    await registry.scan();
    let generated = false;
    const sourceLabel = cli.offline
      ? `本地示例大纲：${cli.outline}`
      : `本地论文：${cli.paper}`;
    const dispatcher = new ToolDispatcher(registry, {
      outputPath: cli.output,
      sourceLabel,
      onDisclosure: (event) => {
        if (event.level === "execute") generated = true;
        printDisclosure(event);
      },
    });

    if (cli.offline) {
      await runOffline(registry, dispatcher, cli.outline);
    } else {
      const config = loadOnlineConfig();
      const paper = await readFile(cli.paper, "utf8");
      console.log("\n[第一层] 注入百炼上下文的薄 Skill 目录：");
      console.log(registry.thinCatalog());
      const agent = new AgentSkillsPptAgent({
        apiKey: config.apiKey,
        baseURL: config.baseURL,
        model: cli.model ?? config.model,
        maxTurns: cli.maxTurns ?? config.maxTurns,
        thinCatalog: registry.thinCatalog(),
        dispatcher,
        ...(!cli.quiet ? { onTrace: printTrace } : {}),
      });
      const finalReply = await agent.run(paper);
      console.log(`\n━━ Agent 最终回复 ━━\n${finalReply}`);
    }

    if (!generated) {
      throw new Error("流程结束但没有生成 PPTX。");
    }
    return 0;
  } catch (error) {
    console.error(`运行失败：${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}

process.exitCode = await main();
