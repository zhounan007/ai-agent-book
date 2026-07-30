import type {
  ExperimentMessage,
  ModelGateway,
  ModelResponse,
  SourceDocument,
  SummaryGateway,
} from "./types.js";

export class OfflineSummaryGateway implements SummaryGateway {
  async summarize(
    _task: string,
    documents: SourceDocument[],
  ): Promise<ModelResponse> {
    const content = documents
      .map((document) =>
        [
          `## ${document.title}`,
          ...document.keyFacts.map((fact) => `- ${fact}`),
          `[来源: ${document.url}]`,
        ].join("\n"),
      )
      .join("\n\n");
    return {
      content,
      usage: {
        promptTokens: Math.ceil(
          documents.reduce(
            (total, document) => total + document.content.length,
            0,
          ) / 3,
        ),
        completionTokens: Math.ceil(content.length / 3),
      },
    };
  }
}

export class OfflineAnswerGateway implements ModelGateway {
  readonly #documents: SourceDocument[];

  constructor(documents: SourceDocument[]) {
    this.#documents = documents;
  }

  async complete(
    messages: ExperimentMessage[],
  ): Promise<ModelResponse> {
    const context = JSON.stringify(messages);
    const sections = this.#documents.flatMap((document) => {
      const facts = document.keyFacts.filter((fact) =>
        context.includes(fact),
      );
      if (!facts.length) {
        return [];
      }
      return [
        [
          `## ${document.title}`,
          ...facts.map((fact) => `- ${fact}`),
          `[来源: ${document.url}]`,
        ].join("\n"),
      ];
    });
    const missing = this.#documents.filter(
      (document) =>
        !document.keyFacts.some((fact) => context.includes(fact)),
    );
    return {
      content: [
        ...sections,
        ...(missing.length
          ? [
              `\n缺失资料：${missing.map((item) => item.title).join("、")}。`,
            ]
          : []),
      ].join("\n\n"),
      finishReason: "stop",
      usage: {
        promptTokens: Math.ceil(context.length / 3),
        completionTokens: Math.ceil(
          sections.join("\n").length / 3,
        ),
      },
    };
  }
}
