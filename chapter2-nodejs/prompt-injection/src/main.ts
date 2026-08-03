import { ATTACKS, findAttack } from "./attacks.js";
import { BailianGateway } from "./bailian-gateway.js";
import {
  loadConfig,
  parseAttack,
  parseDefense,
} from "./config.js";
import { DEFENSES, findDefense } from "./defenses.js";
import { printMatrix, runMatrix } from "./experiment.js";
import { ScriptedAttackGateway } from "./offline-gateway.js";
import type {
  Attack,
  AttackId,
  DefenseConfig,
  DefenseId,
} from "./types.js";

const args = process.argv.slice(2);
const config = loadConfig();
const offline = args.includes("--offline");
const attacks = selectAttacks(
  optionValue(args, "--attack"),
  config.attack,
);
const defenses = selectDefenses(
  optionValue(args, "--defense"),
  config.defense,
);
const trials = positiveIntegerOption(
  optionValue(args, "--trials"),
  config.trials,
  "--trials",
);

if (!offline && !config.apiKey) {
  throw new Error(
    "在线模式需要 DASHSCOPE_API_KEY。请复制 env.example 为 .env 后填写 AK，或运行 --offline。",
  );
}

const onlineGateway = config.apiKey
  ? new BailianGateway(config.apiKey, config.baseUrl)
  : undefined;

console.log(
  `【${offline ? "离线脚本" : "百炼在线"}】model=${offline ? "offline-scripted-model" : config.model}`,
);
console.log(
  `攻击=${attacks.map((item) => item.id).join(", ")}, ` +
    `防御=${defenses.map((item) => item.id).join(", ")}, ` +
    `每组合试验=${trials}`,
);

const results = await runMatrix({
  attacks,
  defenses,
  trials,
  model: offline ? "offline-scripted-model" : config.model,
  maxSteps: config.maxSteps,
  temperature: config.temperature,
  mode: offline ? "offline" : "online",
  gatewayFactory: (attack, defense) => {
    if (offline) {
      return new ScriptedAttackGateway(attack.id, defense.id);
    }
    if (!onlineGateway) {
      throw new Error("百炼网关未初始化。");
    }
    return onlineGateway;
  },
  saveTrajectory: config.saveTrajectory,
  trajectoryDir: config.trajectoryDir,
  onRequest: (attack, defense, userTurn, step, messageCount) => {
    console.log(
      `[${attack.name} × ${defense.name}] ` +
        `userTurn=${userTurn}, step=${step}, messages=${messageCount}`,
    );
  },
});
printMatrix(results);

function selectAttacks(
  value: string | undefined,
  fallback: AttackId,
): Attack[] {
  if (!value) {
    return [findAttack(fallback)];
  }
  if (value === "all") {
    return [...ATTACKS];
  }
  return value.split(",").map((item) =>
    findAttack(parseAttack(item.trim())),
  );
}

function selectDefenses(
  value: string | undefined,
  fallback: DefenseId,
): DefenseConfig[] {
  if (!value) {
    return [findDefense(fallback)];
  }
  if (value === "all") {
    return [...DEFENSES];
  }
  return value.split(",").map((item) =>
    findDefense(parseDefense(item.trim())),
  );
}

function optionValue(
  values: string[],
  name: string,
): string | undefined {
  const index = values.indexOf(name);
  if (index === -1) {
    return undefined;
  }
  const value = values[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${name} 后需要提供值。`);
  }
  return value;
}

function positiveIntegerOption(
  value: string | undefined,
  fallback: number,
  name: string,
): number {
  if (value === undefined) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${name} 必须是正整数，实际为 ${value}。`);
  }
  return parsed;
}
