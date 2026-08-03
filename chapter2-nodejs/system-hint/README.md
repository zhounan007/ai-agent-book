# 实验 2-8：百炼 + TypeScript Agent 状态栏

本项目使用 TypeScript 复现第二章“Agent 状态栏”案例：

- 阿里云百炼 `qwen3.7-plus`
- OpenAI 兼容 Chat Completions 与 Function Calling
- 状态由 TypeScript 代码根据真实执行结果维护
- 状态栏作为末尾 `role: "user"` 元消息注入
- 对比 `none`、`replace`、`append` 三种策略
- 保存每轮真实请求消息和 trajectory，便于断点调试

现有 Python 项目保持不变。

## 核心结构

```text
固定 System Prompt + 原始轨迹
              │
              ├── AgentStatusStore
              │     ├── 时间戳
              │     ├── 工具调用计数
              │     ├── TODO
              │     ├── 最近错误
              │     └── 当前运行环境
              │
              ▼
末尾追加 role=user 的 <agent_status>
              │
              ▼
百炼 qwen3.7-plus 决定回复或调用工具
```

状态栏不是让另一个模型总结历史，而是由代码维护确定性状态。这样可以避免
“让 LLM 扫描长历史再统计”的同类问题，也便于对状态准确率做测试。

## 三种更新策略

| 策略 | 行为 | 取舍 |
| --- | --- | --- |
| `none` | 不注入状态栏 | 对照组 |
| `replace` | 每次请求临时附加最新状态，不写入持久历史 | 上下文整洁，默认 |
| `append` | 每轮把新状态永久追加到历史 | 前缀只追加，但会累积陈旧状态 |

## 安装

```bash
cd chapter2-nodejs
npm install
```

## 离线对照

不需要 AK，脚本化模型会固定执行“建立 TODO → 读取不存在文件 → 根据错误改变策略”
的流程，并打印三种策略下的消息数量与最新状态栏：

```bash
npm run demo:system-hint
```

只观察一种策略：

```bash
cd system-hint
npm start -- --offline --strategy append
```

建议断点位置：

- `src/status-store.ts` 的 `render()`：观察状态如何由代码生成
- `src/agent.ts` 的 `run()`：观察状态消息插入位置
- `src/tools.ts` 的 `execute()`：观察工具名和参数校验
- `src/bailian-gateway.ts`：观察百炼返回结构归一化

## 百炼在线模式

复制示例配置并填写 AK：

```bash
cd chapter2-nodejs/system-hint
cp env.example .env
npm start
```

不传 `--task` 时，默认运行正式案例：

```text
调查 Agent 状态栏实现，核实错误的 src/status-bar.ts 文件名，
分析状态生成、消息注入、replace/append 差异以及工具校验机制。
```

这个案例不会直接命令模型创建 TODO。预期由 Agent 自己完成以下轨迹：

```text
主动创建 TODO
    → 进入 src
    → 核实 status-bar.ts
    → 文件不存在，错误进入状态栏
    → 根据目录信息调整策略
    → 阅读 status-store.ts、agent.ts、tools.ts
    → 给出带源码路径的结论
```

也可以指定自己的任务与状态策略：

```bash
npm start -- \
  --strategy replace \
  --task "请先创建 TODO，然后读取 README.md 并总结状态栏实现"
```

原来的短任务仍作为在线冒烟测试保留，用于快速验证百炼连接、TODO 工具和
`read_file`：

```bash
npm start -- \
  --strategy replace \
  --task "请先创建 TODO，然后读取 README.md，概括这个项目如何维护 Agent 状态。"
```

VS Code 中对应三个调试入口：

- `Chapter 2 Node.js: Agent 状态栏离线对照`
- `Chapter 2 Node.js: Agent 状态栏在线冒烟测试`
- `Chapter 2 Node.js: Agent 状态栏正式案例`

`.env` 已被仓库根 `.gitignore` 忽略，不会正常进入 Git；`env.example`
不包含真实密钥，可以提交。

## 工具安全边界

教学项目不提供任意 Shell 和写文件能力，仅提供：

- `list_directory`
- `read_file`
- `change_directory`
- `rewrite_todo_list`
- `update_todo_status`

工具执行前会强制校验工具名、JSON、字段类型、额外字段和路径边界。即使模型把
`read_file` 拼错，或返回超出 schema 的参数，也只会得到结构化工具错误。
所有相对路径都基于状态栏中的当前工作目录 `cwd`：进入 `src` 后应使用
`status-store.ts`，而不是再次传入 `src/status-store.ts`。路径失败时，错误结果会
同时返回当前 `cwd` 和修正建议。

## 验证

```bash
npm run check --workspace system-hint
npm test --workspace system-hint
npm run build --workspace system-hint
```

运行轨迹默认保存在 `output/`，其中同时记录持久历史和本轮实际发送给模型的
`requestMessages`，可以直接比较状态栏是否位于上下文末尾。
