import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { ContextCompressor } from "./compressor.js";
import type {
  CompressionStrategy,
  ModelGateway,
  SourceDocument,
  StrategyRunResult,
  SummaryGateway,
} from "./types.js";

export interface ExperimentOptions {
  task: string;
  documents: SourceDocument[];
  strategies: CompressionStrategy[];
  slidingWindowSize: number;
  summaryGateway: SummaryGateway;
  answerGateway: ModelGateway;
  saveTrajectory: boolean;
  trajectoryDir: string;
  mode: "offline" | "online";
  model: string;
}

export async function runExperiment(
  options: ExperimentOptions,
): Promise<StrategyRunResult[]> {
  const results: StrategyRunResult[] = [];
  for (const strategy of options.strategies) {
    const startedAt = performance.now();
    const compression = await new ContextCompressor({
      strategy,
      slidingWindowSize: options.slidingWindowSize,
      summaryGateway: options.summaryGateway,
    }).compress(options.task, options.documents);
    const answer = await options.answerGateway.complete(
      compression.messages,
    );
    const durationMs = Math.round(performance.now() - startedAt);
    const allFacts = options.documents.flatMap(
      (document) => document.keyFacts,
    );
    const result: StrategyRunResult = {
      ...compression,
      answer: answer.content,
      answerFactCoverage: allFacts.filter((fact) =>
        answer.content.includes(fact),
      ).length,
      ...(answer.usage ? { answerUsage: answer.usage } : {}),
      durationMs,
    };
    if (options.saveTrajectory) {
      const trajectoryPath = await saveTrajectory(
        options,
        result,
      );
      result.trajectoryPath = trajectoryPath;
    }
    results.push(result);
  }
  return results;
}

async function saveTrajectory(
  options: ExperimentOptions,
  result: StrategyRunResult,
): Promise<string> {
  await mkdir(options.trajectoryDir, { recursive: true });
  const path = join(
    options.trajectoryDir,
    `${options.mode}-${result.strategy}-trajectory.json`,
  );
  await writeFile(
    path,
    JSON.stringify(
      {
        savedAt: new Date().toISOString(),
        mode: options.mode,
        model: options.model,
        task: options.task,
        strategy: result.strategy,
        metrics: {
          originalCharacters: result.originalCharacters,
          requestCharacters: result.requestCharacters,
          estimatedPromptTokens: result.estimatedPromptTokens,
          compressionRatio: result.compressionRatio,
          retainedFacts: result.retainedFacts,
          totalFacts: result.totalFacts,
          answerFactCoverage: result.answerFactCoverage,
          durationMs: result.durationMs,
          summaryUsage: result.summaryUsage,
          answerUsage: result.answerUsage,
        },
        requestMessages: result.messages,
        finalAnswer: result.answer,
      },
      null,
      2,
    ),
    "utf8",
  );
  return path;
}

export function printResults(results: StrategyRunResult[]): void {
  console.log("\n压缩策略对比：");
  console.table(
    results.map((result) => ({
      strategy: result.strategy,
      messages: result.messages.length,
      originalChars: result.originalCharacters,
      requestChars: result.requestCharacters,
      compression: `${(result.compressionRatio * 100).toFixed(1)}%`,
      estimatedTokens: result.estimatedPromptTokens,
      actualPromptTokens:
        result.answerUsage?.promptTokens ?? "N/A",
      retainedFacts: `${result.retainedFacts}/${result.totalFacts}`,
      answerFacts: `${result.answerFactCoverage}/${result.totalFacts}`,
      durationMs: result.durationMs,
    })),
  );

  for (const result of results) {
    console.log(`\n=== ${result.strategy} ===`);
    console.log(result.answer || "模型没有返回文本。");
    if (result.trajectoryPath) {
      console.log(`轨迹：${result.trajectoryPath}`);
    }
  }
}
