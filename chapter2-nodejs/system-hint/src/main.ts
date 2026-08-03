import { SystemHintAgent } from "./agent.js";
import { BailianCompletionGateway } from "./bailian-gateway.js";
import { loadConfig, parseStrategy } from "./config.js";
import { STATUS_BAR_CASE_TASK } from "./demo-tasks.js";
import { runOfflineDemo } from "./offline-demo.js";
import { AgentStatusStore } from "./status-store.js";
import type { StatusUpdateStrategy } from "./types.js";

const args = process.argv.slice(2);
const config = loadConfig();
const strategyArg = optionValue(args, "--strategy");
const selectedStrategy = strategyArg
  ? parseStrategy(strategyArg)
  : undefined;

if (args.includes("--offline")) {
  await runOfflineDemo(config.projectRoot, selectedStrategy);
} else {
  if (!config.apiKey) {
    throw new Error(
      "在线模式需要 DASHSCOPE_API_KEY。请复制 env.example 为 .env 后填写 AK，或运行 --offline。",
    );
  }
  const task =
    optionValue(args, "--task") ?? STATUS_BAR_CASE_TASK;
  const strategy: StatusUpdateStrategy =
    selectedStrategy ?? config.strategy;
  const status = new AgentStatusStore({
    strategy,
    features: config.features,
    initialDirectory: config.projectRoot,
  });
  const agent = new SystemHintAgent({
    gateway: new BailianCompletionGateway(config.apiKey, config.baseUrl),
    model: config.model,
    status,
    projectRoot: config.projectRoot,
    maxTurns: config.maxTurns,
    saveTrajectory: config.saveTrajectory,
    trajectoryPath: config.trajectoryPath,
    onRequest: (iteration, messages) => {
      console.log(
        `[第 ${iteration} 轮] strategy=${strategy}, messages=${messages.length}`,
      );
    },
  });
  const result = await agent.run(task);
  console.log(`\n模型：${config.model}`);
  console.log(`状态更新策略：${strategy}`);
  console.log(`迭代次数：${result.iterations}`);
  console.log(`最终回答：\n${result.finalAnswer ?? "模型未返回最终文本。"}`);
  if (result.trajectoryPath) {
    console.log(`轨迹：${result.trajectoryPath}`);
  }
}

function optionValue(args: string[], name: string): string | undefined {
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
