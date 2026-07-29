# Web Search Agent（Node.js / TypeScript）

这是 `chapter1/web-search-agent` 的 TypeScript 对照实现，并扩展为多 Provider：

- 阿里百炼 `qwen3.7-plus`：Responses API + `web_search` 真正联网
- DeepSeek `deepseek-v4-flash`：模型问答，不伪装成联网搜索
- Moonshot 内置 `$web_search` 工具
- “思考 → 行动 → 观察 → 最终答案”的 ReAct 轨迹
- 多轮工具调用和最大迭代次数限制
- OpenRouter 无实时搜索兜底
- 单次问答、交互模式、离线演示和 JSON 输出

## 快速开始

在 `chapter1-nodejs` 目录安装依赖：

```bash
npm install
cp web-search-agent/env.example web-search-agent/.env
```

使用阿里百炼联网搜索：

```bash
export DASHSCOPE_API_KEY="你的百炼-key"
npm start --workspace web-search-agent -- "最近有哪些重要的 AI 新闻？" --provider bailian
```

使用 DeepSeek 模型问答：

```bash
export DEEPSEEK_API_KEY="你的-deepseek-key"
npm start --workspace web-search-agent -- "解释 ReAct Agent" --provider deepseek
```

无需 API Key 的离线演示：

```bash
npm run demo --workspace web-search-agent
```

## CLI

```bash
npm start --workspace web-search-agent -- --help
npm start --workspace web-search-agent -- --provider offline-demo
npm start --workspace web-search-agent -- "比特币现价" --provider bailian -o result.json
```

常用参数：

| 参数 | 说明 | 默认值 |
|---|---|---|
| `--provider` | `bailian`、`deepseek`、`kimi` 或 `offline-demo` | `kimi` |
| `--model` | 覆盖 Provider 默认模型 | 随 Provider 变化 |
| `--max-steps` | 最大 ReAct 迭代次数 | `5` |
| `--base-url` | 覆盖 Provider API 地址 | 随 Provider 变化 |
| `--api-key` | API Key；通常使用环境变量 | 无 |
| `--output`, `-o` | 保存结构化 JSON 结果 | 无 |
| `--quiet` | 不实时打印轨迹 | 关闭 |

## 开发验证

```bash
npm run check --workspace web-search-agent
npm test --workspace web-search-agent
npm run build --workspace web-search-agent
```

## 目录结构

```text
web-search-agent/
├── src/
│   ├── agent.ts
│   ├── config.ts
│   ├── main.ts
│   ├── quickstart.ts
│   ├── examples.ts
│   └── *.test.ts
├── env.example
├── package.json
└── tsconfig.json
```

OpenRouter 仅作为语言模型兜底。Moonshot 的 `$web_search` 是专有内置工具，因此
OpenRouter 模式不会执行实时联网搜索。

### Provider 默认配置

| Provider | 模型 | 环境变量 | 实时联网 |
|---|---|---|---|
| `bailian` | `qwen3.7-plus` | `DASHSCOPE_API_KEY` | 是 |
| `deepseek` | `deepseek-v4-flash` | `DEEPSEEK_API_KEY` | 否 |
| `kimi` | `kimi-k3` | `MOONSHOT_API_KEY` | 是 |

百炼默认使用北京地域公共地址。其他地域或业务空间可设置
`DASHSCOPE_BASE_URL` 覆盖；DeepSeek 和 Kimi 分别支持
`DEEPSEEK_BASE_URL`、`KIMI_BASE_URL`。

## VS Code 断点调试

打开仓库根目录，在“运行和调试”面板中选择：

- `Chapter 1 Node.js: Web Search 离线演示`
- `Chapter 1 Node.js: 百炼联网搜索`
- `Chapter 1 Node.js: DeepSeek 问答`
- `Chapter 1 Node.js: Kimi 在线单次问答`
- `Chapter 1 Node.js: Kimi 在线交互模式`

在线入口启动时会安全提示输入对应 API Key，密钥只注入本次调试进程，不会写入
文件。可以直接在 `src/main.ts` 或 `src/agent.ts` 中设置断点。
