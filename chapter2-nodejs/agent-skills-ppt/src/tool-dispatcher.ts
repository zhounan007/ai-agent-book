import type OpenAI from "openai";
import { generatePptx, type GeneratedPresentation } from "./generators/pptx.js";
import { SkillRegistry } from "./skill-registry.js";

export const skillTools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "read_skill",
      description: "加载指定 Skill 的完整 SKILL.md，获得专业任务核心流程。",
      parameters: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "Skill 名称，例如 pptx。",
          },
        },
        required: ["name"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_skill_file",
      description: "按需读取 Skill 内的参考资料或技术细则。",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Skill 名称。" },
          path: {
            type: "string",
            description: "Skill 目录内的相对路径，例如 reference.md。",
          },
        },
        required: ["name", "path"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "run_skill_script",
      description: "执行 Skill 明确允许的捆绑脚本并生成真实产物。",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Skill 名称。" },
          script: {
            type: "string",
            enum: ["generate-pptx"],
            description: "白名单脚本名称。",
          },
          payload: {
            type: "object",
            description: "SKILL.md 规定的结构化演示文稿大纲。",
            properties: {
              title: { type: "string" },
              subtitle: { type: "string" },
              slides: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    title: { type: "string" },
                    bullets: {
                      type: "array",
                      items: { type: "string" },
                    },
                  },
                  required: ["title", "bullets"],
                  additionalProperties: false,
                },
              },
            },
            required: ["title", "slides"],
            additionalProperties: false,
          },
        },
        required: ["name", "script", "payload"],
        additionalProperties: false,
      },
    },
  },
];

export type DisclosureEvent =
  | { level: 2; name: string; characters: number }
  | { level: 3; name: string; path: string; characters: number }
  | { level: "execute"; name: string; script: string; result: GeneratedPresentation };

export interface ToolDispatcherOptions {
  outputPath: string;
  sourceLabel: string;
  onDisclosure?: (event: DisclosureEvent) => void;
}

function argumentsObject(rawArguments: string): Record<string, unknown> {
  let value: unknown;
  try {
    value = JSON.parse(rawArguments);
  } catch {
    throw new Error("工具参数不是有效 JSON。");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("工具参数必须是 JSON 对象。");
  }
  return value as Record<string, unknown>;
}

function stringField(
  args: Record<string, unknown>,
  name: string,
): string {
  const value = args[name];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`缺少字符串参数 ${name}。`);
  }
  return value.trim();
}

export class ToolDispatcher {
  readonly #registry: SkillRegistry;
  readonly #options: ToolDispatcherOptions;

  constructor(registry: SkillRegistry, options: ToolDispatcherOptions) {
    this.#registry = registry;
    this.#options = options;
  }

  async execute(name: string, rawArguments: string): Promise<string> {
    try {
      const args = argumentsObject(rawArguments);
      if (name === "read_skill") {
        const skillName = stringField(args, "name");
        const content = await this.#registry.readSkill(skillName);
        this.#options.onDisclosure?.({
          level: 2,
          name: skillName,
          characters: content.length,
        });
        return content;
      }
      if (name === "read_skill_file") {
        const skillName = stringField(args, "name");
        const path = stringField(args, "path");
        const content = await this.#registry.readSkillFile(skillName, path);
        this.#options.onDisclosure?.({
          level: 3,
          name: skillName,
          path,
          characters: content.length,
        });
        return content;
      }
      if (name === "run_skill_script") {
        const skillName = stringField(args, "name");
        const script = stringField(args, "script");
        if (skillName !== "pptx" || script !== "generate-pptx") {
          throw new Error(`脚本不在白名单：${skillName}/${script}`);
        }
        const result = await generatePptx(args.payload, {
          outputPath: this.#options.outputPath,
          sourceLabel: this.#options.sourceLabel,
        });
        this.#options.onDisclosure?.({
          level: "execute",
          name: skillName,
          script,
          result,
        });
        return JSON.stringify(result);
      }
      throw new Error(`未知工具：${name}`);
    } catch (error) {
      return JSON.stringify({
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
