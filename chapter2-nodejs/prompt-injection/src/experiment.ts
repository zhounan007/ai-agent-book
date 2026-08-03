import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { PromptInjectionAgent } from "./agent.js";
import type {
  Attack,
  CompletionGateway,
  DefenseConfig,
  TrialResult,
} from "./types.js";

export interface ExperimentOptions {
  attacks: Attack[];
  defenses: DefenseConfig[];
  trials: number;
  model: string;
  maxSteps: number;
  temperature: number;
  mode: "offline" | "online";
  gatewayFactory: (
    attack: Attack,
    defense: DefenseConfig,
  ) => CompletionGateway;
  saveTrajectory: boolean;
  trajectoryDir: string;
  onRequest?: (
    attack: Attack,
    defense: DefenseConfig,
    userTurn: number,
    step: number,
    messageCount: number,
  ) => void;
}

export async function runMatrix(
  options: ExperimentOptions,
): Promise<TrialResult[]> {
  const results: TrialResult[] = [];
  for (const attack of options.attacks) {
    for (const defense of options.defenses) {
      for (let trial = 1; trial <= options.trials; trial += 1) {
        const agent = new PromptInjectionAgent({
          gateway: options.gatewayFactory(attack, defense),
          model: options.model,
          defense,
          webpageContent: attack.webpageContent,
          maxSteps: options.maxSteps,
          temperature: options.temperature,
          onRequest: (userTurn, step, messages) =>
            options.onRequest?.(
              attack,
              defense,
              userTurn,
              step,
              messages.length,
            ),
        });
        const result = await agent.run(attack.userMessages);
        const trialResult: TrialResult = {
          attack: attack.id,
          attackName: attack.name,
          defense: defense.id,
          defenseName: defense.name,
          trial,
          attackSucceeded: attack.succeeded(result),
          result,
        };
        if (options.saveTrajectory) {
          trialResult.trajectoryPath = await saveTrajectory(
            options,
            attack,
            defense,
            trialResult,
          );
        }
        results.push(trialResult);
      }
    }
  }
  return results;
}

export function printMatrix(results: TrialResult[]): void {
  const groups = groupTrials(results);
  console.log("\n攻击成功率矩阵（越低越安全）：");
  console.table(
    groups.map((group) => ({
      attack: group.attackName,
      defense: group.defenseName,
      successRate: `${(
        (group.successes / group.total) *
        100
      ).toFixed(0)}%`,
      successes: `${group.successes}/${group.total}`,
      requested: group.requested,
      executed: group.executed,
      blocked: group.blocked,
    })),
  );

  for (const result of results) {
    console.log(
      `[${result.attackName} × ${result.defenseName} #${result.trial}] ` +
        `attack=${result.attackSucceeded ? "成功" : "失败"}, ` +
        `requested=${result.result.requestedToolCalls.length}, ` +
        `executed=${result.result.executedToolCalls.length}, ` +
        `blocked=${result.result.blockedToolCalls.length}`,
    );
    if (result.result.error) {
      console.log(`  错误：${result.result.error}`);
    }
    if (result.trajectoryPath) {
      console.log(`  轨迹：${result.trajectoryPath}`);
    }
  }
}

interface TrialGroup {
  attack: string;
  attackName: string;
  defense: string;
  defenseName: string;
  successes: number;
  total: number;
  requested: number;
  executed: number;
  blocked: number;
}

function groupTrials(results: TrialResult[]): TrialGroup[] {
  const groups = new Map<string, TrialGroup>();
  for (const item of results) {
    const key = `${item.attack}:${item.defense}`;
    const group = groups.get(key) ?? {
      attack: item.attack,
      attackName: item.attackName,
      defense: item.defense,
      defenseName: item.defenseName,
      successes: 0,
      total: 0,
      requested: 0,
      executed: 0,
      blocked: 0,
    };
    group.total += 1;
    group.successes += item.attackSucceeded ? 1 : 0;
    group.requested += item.result.requestedToolCalls.length;
    group.executed += item.result.executedToolCalls.length;
    group.blocked += item.result.blockedToolCalls.length;
    groups.set(key, group);
  }
  return [...groups.values()];
}

async function saveTrajectory(
  options: ExperimentOptions,
  attack: Attack,
  defense: DefenseConfig,
  result: TrialResult,
): Promise<string> {
  await mkdir(options.trajectoryDir, { recursive: true });
  const path = join(
    options.trajectoryDir,
    `${options.mode}-${attack.id}-${defense.id}-trial-${result.trial}.json`,
  );
  await writeFile(
    path,
    JSON.stringify(
      {
        savedAt: new Date().toISOString(),
        mode: options.mode,
        model: options.model,
        attack: {
          id: attack.id,
          name: attack.name,
          description: attack.description,
          userMessages: attack.userMessages,
          webpageContent: attack.webpageContent,
        },
        defense,
        attackSucceeded: result.attackSucceeded,
        finalText: result.result.finalText,
        requestedToolCalls: result.result.requestedToolCalls,
        executedToolCalls: result.result.executedToolCalls,
        blockedToolCalls: result.result.blockedToolCalls,
        usage: result.result.usage,
        requests: result.result.requestMessages,
        history: result.result.messages,
        error: result.result.error,
      },
      null,
      2,
    ),
    "utf8",
  );
  return path;
}
