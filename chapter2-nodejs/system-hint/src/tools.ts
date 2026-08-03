import { readFile, readdir, stat } from "node:fs/promises";
import { relative, resolve } from "node:path";
import type { AgentTool, TodoStatus } from "./types.js";
import { AgentStatusStore } from "./status-store.js";

export const AGENT_TOOLS: AgentTool[] = [
  {
    type: "function",
    function: {
      name: "list_directory",
      description:
        "列出当前项目范围内指定目录的文件和子目录。相对路径相对于状态栏中的当前工作目录（cwd）；如果已经位于目标目录，请使用“.”，不要重复目录前缀。",
      parameters: {
        type: "object",
        properties: {
          directory: {
            type: "string",
            description:
              "目录路径，默认使用当前工作目录。相对路径基于状态栏中的 cwd。",
          },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_file",
      description:
        "读取当前项目范围内的 UTF-8 文本文件，最多返回 200 行。相对路径相对于状态栏中的当前工作目录（cwd）；例如 cwd 已是项目/src 时，应传 status-store.ts，而不是 src/status-store.ts。",
      parameters: {
        type: "object",
        properties: {
          file_path: {
            type: "string",
            description:
              "文件路径。相对路径基于状态栏中的 cwd，也可以使用项目范围内的绝对路径。",
          },
        },
        required: ["file_path"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "change_directory",
      description:
        "切换 Agent 当前目录，但不能离开教学项目根目录。相对路径基于状态栏中的当前工作目录（cwd）。",
      parameters: {
        type: "object",
        properties: {
          directory: {
            type: "string",
            description: "目标目录；相对路径基于状态栏中的 cwd。",
          },
        },
        required: ["directory"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "rewrite_todo_list",
      description: "用一组新的步骤重建 TODO 列表。",
      parameters: {
        type: "object",
        properties: {
          items: {
            type: "array",
            items: { type: "string" },
            minItems: 1,
            maxItems: 10,
          },
        },
        required: ["items"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_todo_status",
      description: "更新一个或多个 TODO 的状态；同一时间只能有一个 in_progress。",
      parameters: {
        type: "object",
        properties: {
          updates: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "integer" },
                status: {
                  type: "string",
                  enum: [
                    "pending",
                    "in_progress",
                    "completed",
                    "cancelled",
                  ],
                },
              },
              required: ["id", "status"],
              additionalProperties: false,
            },
          },
        },
        required: ["updates"],
        additionalProperties: false,
      },
    },
  },
];

export interface ToolExecutionResult {
  content: string;
  isError: boolean;
  callNumber: number;
}

type JsonObject = Record<string, unknown>;

export class SafeToolDispatcher {
  readonly #projectRoot: string;
  readonly #status: AgentStatusStore;

  constructor(projectRoot: string, status: AgentStatusStore) {
    this.#projectRoot = resolve(projectRoot);
    this.#status = status;
  }

  async execute(
    name: string,
    rawArguments: string,
  ): Promise<ToolExecutionResult> {
    const callNumber = this.#status.recordToolCall(name);
    try {
      const args = parseObject(rawArguments);
      const result = await this.#dispatch(name, args);
      return {
        content: JSON.stringify(result, null, 2),
        isError: false,
        callNumber,
      };
    } catch (error) {
      const message = detailedError(
        error,
        name,
        rawArguments,
        this.#status.currentDirectory,
      );
      this.#status.recordError(message);
      return {
        content: JSON.stringify({ success: false, error: message }, null, 2),
        isError: true,
        callNumber,
      };
    }
  }

  async #dispatch(name: string, args: JsonObject): Promise<unknown> {
    switch (name) {
      case "list_directory": {
        assertOnlyKeys(args, ["directory"]);
        const directory =
          optionalString(args, "directory") ?? this.#status.currentDirectory;
        const target = this.#safePath(directory);
        const entries = await readdir(target, { withFileTypes: true });
        return {
          success: true,
          directory: target,
          entries: entries
            .map((entry) => ({
              name: entry.name,
              type: entry.isDirectory() ? "directory" : "file",
            }))
            .sort((left, right) => left.name.localeCompare(right.name)),
        };
      }
      case "read_file": {
        assertOnlyKeys(args, ["file_path"]);
        const target = this.#safePath(requiredString(args, "file_path"));
        const info = await stat(target);
        if (!info.isFile()) {
          throw new Error(`目标不是文件：${target}`);
        }
        const content = await readFile(target, "utf8");
        const lines = content.split(/\r?\n/);
        return {
          success: true,
          filePath: target,
          totalLines: lines.length,
          truncated: lines.length > 200,
          content: lines.slice(0, 200).join("\n"),
        };
      }
      case "change_directory": {
        assertOnlyKeys(args, ["directory"]);
        const target = this.#safePath(requiredString(args, "directory"));
        const info = await stat(target);
        if (!info.isDirectory()) {
          throw new Error(`目标不是目录：${target}`);
        }
        this.#status.setCurrentDirectory(target);
        return { success: true, currentDirectory: target };
      }
      case "rewrite_todo_list": {
        assertOnlyKeys(args, ["items"]);
        const items = requiredStringArray(args, "items");
        if (!items.length || items.length > 10) {
          throw new Error("items 必须包含 1–10 个非空字符串。");
        }
        return { success: true, todos: this.#status.rewriteTodos(items) };
      }
      case "update_todo_status": {
        assertOnlyKeys(args, ["updates"]);
        const updates = requiredTodoUpdates(args, "updates");
        return { success: true, todos: this.#status.updateTodos(updates) };
      }
      default:
        throw new Error(
          `未知工具 ${JSON.stringify(name)}；允许的工具：${AGENT_TOOLS.map((tool) => tool.function.name).join(", ")}`,
        );
    }
  }

  #safePath(input: string): string {
    const target = resolve(this.#status.currentDirectory, input);
    const relation = relative(this.#projectRoot, target);
    if (relation === ".." || relation.startsWith("../") || relation.startsWith("..\\")) {
      throw new Error(`路径越界：${target}`);
    }
    return target;
  }
}

function parseObject(raw: string): JsonObject {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error(`工具参数不是合法 JSON：${raw}`);
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("工具参数必须是 JSON 对象。");
  }
  return value as JsonObject;
}

function assertOnlyKeys(value: JsonObject, allowed: string[]): void {
  const unexpected = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unexpected.length) {
    throw new Error(`出现未定义字段：${unexpected.join(", ")}`);
  }
}

function requiredString(value: JsonObject, key: string): string {
  const result = value[key];
  if (typeof result !== "string" || !result.trim()) {
    throw new Error(`${key} 必须是非空字符串。`);
  }
  return result.trim();
}

function optionalString(value: JsonObject, key: string): string | undefined {
  const result = value[key];
  if (result === undefined) {
    return undefined;
  }
  if (typeof result !== "string" || !result.trim()) {
    throw new Error(`${key} 必须是非空字符串。`);
  }
  return result.trim();
}

function requiredStringArray(value: JsonObject, key: string): string[] {
  const result = value[key];
  if (
    !Array.isArray(result) ||
    result.some((item) => typeof item !== "string" || !item.trim())
  ) {
    throw new Error(`${key} 必须是非空字符串数组。`);
  }
  return result.map((item) => String(item).trim());
}

function requiredTodoUpdates(
  value: JsonObject,
  key: string,
): Array<{ id: number; status: TodoStatus }> {
  const result = value[key];
  const statuses = new Set<TodoStatus>([
    "pending",
    "in_progress",
    "completed",
    "cancelled",
  ]);
  if (!Array.isArray(result) || !result.length) {
    throw new Error(`${key} 必须是非空数组。`);
  }
  return result.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error("每个 TODO 更新必须是对象。");
    }
    const candidate = item as JsonObject;
    assertOnlyKeys(candidate, ["id", "status"]);
    if (!Number.isInteger(candidate.id) || Number(candidate.id) < 1) {
      throw new Error("TODO id 必须是正整数。");
    }
    if (
      typeof candidate.status !== "string" ||
      !statuses.has(candidate.status as TodoStatus)
    ) {
      throw new Error("TODO status 字段无效。");
    }
    return {
      id: Number(candidate.id),
      status: candidate.status as TodoStatus,
    };
  });
}

function detailedError(
  error: unknown,
  name: string,
  raw: string,
  currentDirectory: string,
): string {
  const base = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  return [
    `工具 ${name} 执行失败。`,
    base,
    `参数：${raw}`,
    `当前工作目录：${currentDirectory}`,
    "路径规则：相对路径基于当前工作目录解析；如果已经进入目标目录，请去掉重复的目录前缀。",
    "建议：结合状态栏中的 cwd 修正路径；不要用相同参数盲目重试。",
  ].join("\n");
}
