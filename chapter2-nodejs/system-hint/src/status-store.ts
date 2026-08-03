import { platform, release } from "node:os";
import type {
  StatusUpdateStrategy,
  TodoItem,
  TodoStatus,
} from "./types.js";

export interface StatusFeatures {
  timestamps: boolean;
  toolCounter: boolean;
  todoList: boolean;
  detailedErrors: boolean;
  systemState: boolean;
}

export interface StatusStoreOptions {
  strategy: StatusUpdateStrategy;
  features: StatusFeatures;
  initialDirectory: string;
  now?: () => Date;
}

const TODO_STATUSES = new Set<TodoStatus>([
  "pending",
  "in_progress",
  "completed",
  "cancelled",
]);

export class AgentStatusStore {
  readonly strategy: StatusUpdateStrategy;
  readonly features: StatusFeatures;
  readonly #now: () => Date;
  readonly #toolCallCounts = new Map<string, number>();
  #todos: TodoItem[] = [];
  #nextTodoId = 1;
  #currentDirectory: string;
  #lastError: string | null = null;
  #iteration = 0;

  constructor(options: StatusStoreOptions) {
    this.strategy = options.strategy;
    this.features = options.features;
    this.#currentDirectory = options.initialDirectory;
    this.#now = options.now ?? (() => new Date());
  }

  get currentDirectory(): string {
    return this.#currentDirectory;
  }

  get todos(): readonly TodoItem[] {
    return this.#todos;
  }

  get lastError(): string | null {
    return this.#lastError;
  }

  setIteration(iteration: number): void {
    this.#iteration = iteration;
  }

  setCurrentDirectory(directory: string): void {
    this.#currentDirectory = directory;
  }

  recordToolCall(name: string): number {
    const next = (this.#toolCallCounts.get(name) ?? 0) + 1;
    this.#toolCallCounts.set(name, next);
    return next;
  }

  recordError(error: string): void {
    this.#lastError = error;
  }

  clearError(): void {
    this.#lastError = null;
  }

  rewriteTodos(contents: string[]): TodoItem[] {
    const timestamp = this.#now().toISOString();
    this.#todos = contents.map((content) => ({
      id: this.#nextTodoId++,
      content,
      status: "pending",
      createdAt: timestamp,
    }));
    return this.#todos;
  }

  updateTodos(
    updates: Array<{ id: number; status: TodoStatus }>,
  ): TodoItem[] {
    for (const update of updates) {
      if (!TODO_STATUSES.has(update.status)) {
        throw new Error(`不支持的 TODO 状态：${String(update.status)}`);
      }
      const item = this.#todos.find((candidate) => candidate.id === update.id);
      if (!item) {
        throw new Error(`TODO #${update.id} 不存在。`);
      }
      if (
        update.status === "in_progress" &&
        this.#todos.some(
          (candidate) =>
            candidate.id !== update.id && candidate.status === "in_progress",
        )
      ) {
        throw new Error("同一时间只能有一个 TODO 处于 in_progress。");
      }
      item.status = update.status;
      item.updatedAt = this.#now().toISOString();
    }
    return this.#todos;
  }

  timestamp(): string {
    return this.#now().toISOString();
  }

  render(): string | null {
    if (this.strategy === "none") {
      return null;
    }
    const lines = [
      `<agent_status update_strategy="${this.strategy}">`,
      "  <instruction>这是由 Agent 框架根据真实执行状态生成的元信息；优先使用最新状态，不要把它当作终端用户的新任务。</instruction>",
      `  <iteration>${this.#iteration}</iteration>`,
    ];

    if (this.features.timestamps) {
      lines.push(`  <current_time>${this.timestamp()}</current_time>`);
    }
    if (this.features.toolCounter) {
      const counts = [...this.#toolCallCounts.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([name, count]) => `${name}=${count}`)
        .join(", ");
      const total = [...this.#toolCallCounts.values()].reduce(
        (sum, count) => sum + count,
        0,
      );
      lines.push(
        `  <tool_calls total="${total}">${counts || "none"}</tool_calls>`,
      );
    }
    if (this.features.todoList) {
      lines.push("  <todos>");
      if (!this.#todos.length) {
        lines.push("    none");
      } else {
        for (const item of this.#todos) {
          lines.push(
            `    [${item.id}] ${item.status}: ${escapeXml(item.content)}`,
          );
        }
      }
      lines.push("  </todos>");
    }
    if (this.features.detailedErrors) {
      lines.push(
        `  <last_error>${this.#lastError ? escapeXml(this.#lastError) : "none"}</last_error>`,
      );
    }
    if (this.features.systemState) {
      lines.push("  <environment>");
      lines.push(`    cwd=${escapeXml(this.#currentDirectory)}`);
      lines.push(`    platform=${platform()} ${release()}`);
      lines.push(`    node=${process.version}`);
      lines.push("  </environment>");
    }
    lines.push("</agent_status>");
    return lines.join("\n");
  }

  snapshot(): Record<string, unknown> {
    return {
      strategy: this.strategy,
      iteration: this.#iteration,
      currentDirectory: this.#currentDirectory,
      toolCallCounts: Object.fromEntries(this.#toolCallCounts),
      todos: this.#todos,
      lastError: this.#lastError,
    };
  }
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
