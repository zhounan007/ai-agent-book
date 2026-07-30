import type {
  ExperimentMessage,
  SourceDocument,
} from "./types.js";

const SYSTEM_PROMPT = `你是一个版本资料分析助手。

规则：
1. 只使用轨迹中 search_documents 工具返回的资料。
2. 回答必须覆盖 2024、2025、2026 的核心能力和上下文上限。
3. 说明迁移要求、压缩触发条件及 KV Cache 与窗口容量的关系。
4. 每项结论都使用 [来源: URL] 标注来源。
5. 如果上下文缺少资料，明确说明缺失，不得编造。`;

export function buildFullTrajectory(
  task: string,
  documents: SourceDocument[],
): ExperimentMessage[] {
  const messages: ExperimentMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: task },
  ];

  for (const [index, source] of documents.entries()) {
    const callId = `fixture-search-${index + 1}`;
    messages.push({
      role: "assistant",
      content: null,
      tool_calls: [
        {
          id: callId,
          type: "function",
          function: {
            name: "search_documents",
            arguments: JSON.stringify({ source_id: source.id }),
          },
        },
      ],
    });
    messages.push({
      role: "tool",
      tool_call_id: callId,
      content: serializeSource(source),
    });
  }

  messages.push({
    role: "user",
    content:
      "资料加载完毕。请现在完成版本演进分析，并严格保留来源引用。",
  });
  return messages;
}

export function serializeSource(source: SourceDocument): string {
  return JSON.stringify(
    {
      sourceId: source.id,
      title: source.title,
      url: source.url,
      content: source.content,
    },
    null,
    2,
  );
}
