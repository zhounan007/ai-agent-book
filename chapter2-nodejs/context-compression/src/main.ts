import { BailianGateway } from "./bailian-gateway.js";
import { loadConfig, parseStrategy } from "./config.js";
import { createDemoCorpus } from "./corpus.js";
import { printResults, runExperiment } from "./experiment.js";
import {
  OfflineAnswerGateway,
  OfflineSummaryGateway,
} from "./offline-gateway.js";
import type { CompressionStrategy } from "./types.js";

export const DEFAULT_TASK =
  "调查 Northstar Agent Platform 从 2024 到 2026 的版本演进：比较核心能力和上下文上限，说明迁移要求、压缩触发条件，以及 KV Cache 是否会释放上下文窗口容量。";

const args = process.argv.slice(2);
const config = loadConfig();
const offline = args.includes("--offline");
const strategyArg = optionValue(args, "--strategy");
const strategies = selectStrategies(strategyArg, config.strategy);
const task = optionValue(args, "--task") ?? DEFAULT_TASK;
const documents = createDemoCorpus();

if (offline) {
  console.log("【离线模式】使用固定资料与脚本化模型，不调用百炼。");
  const summaryGateway = new OfflineSummaryGateway();
  const results = await runExperiment({
    task,
    documents,
    strategies,
    slidingWindowSize: config.slidingWindowSize,
    summaryGateway,
    answerGateway: new OfflineAnswerGateway(documents),
    saveTrajectory: config.saveTrajectory,
    trajectoryDir: config.trajectoryDir,
    mode: "offline",
    model: "offline-scripted-model",
  });
  printResults(results);
} else {
  if (!config.apiKey) {
    throw new Error(
      "在线模式需要 DASHSCOPE_API_KEY。请复制 env.example 为 .env 后填写 AK，或运行 --offline。",
    );
  }
  const gateway = new BailianGateway(
    config.apiKey,
    config.baseUrl,
    config.model,
  );
  console.log(
    `【百炼在线模式】model=${config.model}, strategies=${strategies.join(", ")}`,
  );
  const results = await runExperiment({
    task,
    documents,
    strategies,
    slidingWindowSize: config.slidingWindowSize,
    summaryGateway: gateway,
    answerGateway: gateway,
    saveTrajectory: config.saveTrajectory,
    trajectoryDir: config.trajectoryDir,
    mode: "online",
    model: config.model,
  });
  printResults(results);
}

function selectStrategies(
  value: string | undefined,
  fallback: CompressionStrategy,
): CompressionStrategy[] {
  if (!value) {
    return [fallback];
  }
  if (value === "all") {
    return ["none", "sliding-window", "context-aware"];
  }
  return [parseStrategy(value)];
}

function optionValue(
  args: string[],
  name: string,
): string | undefined {
  const index = args.indexOf(name);
  if (index === -1) {
    return undefined;
  }
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${name} 后需要提供值。`);
  }
  return value;
}
