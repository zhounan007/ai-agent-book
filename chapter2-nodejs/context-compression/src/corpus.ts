import type { SourceDocument } from "./types.js";

const BOILERPLATE = [
  "本资料来自 Northstar Agent Platform 教学档案，只用于上下文压缩实验。",
  "平台团队每季度复查兼容性、可观测性、工具协议和迁移风险。",
  "文档中的版本号、能力名称和迁移要求是实验所需信息，其余段落用于模拟真实长文中的背景噪声。",
  "维护人员应以版本说明中的明确事实为准，不应根据重复的背景文字推断额外结论。",
].join("\n");

export function createDemoCorpus(): SourceDocument[] {
  return [
    document(
      "release-2024",
      "Northstar 2024 版本说明",
      "local://northstar/release-2024",
      [
        "Northstar 2024 的核心能力是 ContextCore。",
        "Northstar 2024 的上下文上限是 32K token。",
        "Northstar 2024 使用 legacy function_call 字段。",
      ],
    ),
    document(
      "release-2025",
      "Northstar 2025 版本说明",
      "local://northstar/release-2025",
      [
        "Northstar 2025 引入 ToolGraph。",
        "Northstar 2025 的上下文上限提升到 128K token。",
        "迁移到 Northstar 2025 必须保存并回传 tool_call_id。",
      ],
    ),
    document(
      "release-2026",
      "Northstar 2026 版本说明",
      "local://northstar/release-2026",
      [
        "Northstar 2026 引入 StateRail 状态栏。",
        "Northstar 2026 的上下文上限提升到 1M token。",
        "StateRail 默认使用 replace 模式注入最新状态。",
      ],
    ),
    document(
      "operations-guide",
      "Northstar 长任务运维指南",
      "local://northstar/operations-guide",
      [
        "上下文使用率达到 70% 时应触发压缩。",
        "压缩摘要必须保留事实来源和未完成任务。",
        "KV Cache 命中不会释放上下文窗口容量。",
      ],
    ),
  ];
}

function document(
  id: string,
  title: string,
  url: string,
  keyFacts: string[],
): SourceDocument {
  const background = Array.from(
    { length: 18 },
    (_value, index) =>
      `背景段落 ${index + 1}：${BOILERPLATE}`,
  ).join("\n\n");
  return {
    id,
    title,
    url,
    content: [
      `# ${title}`,
      "",
      "## 必须保留的版本事实",
      ...keyFacts.map((fact) => `- ${fact}`),
      "",
      "## 背景资料",
      background,
    ].join("\n"),
    keyFacts,
  };
}
