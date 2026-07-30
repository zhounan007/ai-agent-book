# 实验 2-9：百炼 + TypeScript 上下文压缩

本项目用固定的长资料轨迹，对比三种上下文管理策略：

| 策略 | 行为 | 主要取舍 |
| --- | --- | --- |
| `none` | 完整保留所有工具结果 | 信息最全，token 增长最快 |
| `sliding-window` | 只保留最近 N 个完整工具结果 | 便宜直接，可能丢失早期关键事实 |
| `context-aware` | 根据当前任务把全部旧资料压缩成带来源摘要 | 信息密度高，但增加一次摘要调用 |

实验使用虚构的 Northstar Agent Platform 资料，不依赖联网搜索。三种策略输入完全一致，
因此可以稳定比较上下文长度、事实保留率和回答完整性。

## 核心流程

```text
固定任务 + 四次 search_documents 工具轨迹
                    │
          ┌─────────┼──────────────┐
          ▼         ▼              ▼
        none   sliding-window  context-aware
          │         │              │
          └─────────┼──────────────┘
                    ▼
             发送给回答模型
                    ▼
        比较 token、压缩率和事实覆盖率
```

`context-aware` 的摘要模型看到当前任务，因此会重点保留版本号、能力、token 上限、
迁移要求、压缩阈值和引用。摘要调用自身也消耗 token，轨迹中的 `summaryUsage` 会单独记录。

## 安装

```bash
cd chapter2-nodejs
npm install
```

## 离线调试

不需要 AK，固定模型会根据请求上下文中实际存在的事实作答：

```bash
npm run demo:context-compression
```

只运行一种策略：

```bash
cd context-compression
npm start -- --offline --strategy sliding-window
```

建议断点位置：

- `src/trajectory.ts`：观察完整工具轨迹如何组装
- `src/compressor.ts` 的 `compress()`：观察三种策略分支
- `src/compressor.ts` 的 `applySlidingWindow()`：观察旧工具结果被替换
- `src/compressor.ts` 的 `applyCombinedSummary()`：观察摘要写回 messages
- `src/experiment.ts`：观察指标统计与最终请求

## 百炼在线模式

```bash
cd chapter2-nodejs/context-compression
cp env.example .env
# 填写 DASHSCOPE_API_KEY
npm start -- --strategy all
```

默认模型为 `qwen3.7-plus`，通过百炼 OpenAI 兼容 Chat Completions 接口调用。

注意：`--strategy all` 在线运行时会分别调用三种策略；`context-aware` 还会额外产生
一次摘要调用。调试单个策略时建议明确传入：

```bash
npm start -- --strategy context-aware
```

## 指标说明

- `originalChars`：未压缩 messages 的 JSON 字符数
- `requestChars`：实际发送 messages 的 JSON 字符数
- `compression`：字符维度压缩率
- `estimatedTokens`：本地粗略估算，只用于离线观察
- `actualPromptTokens`：百炼响应 `usage.prompt_tokens`
- `retainedFacts`：压缩后上下文仍包含的固定关键事实数
- `answerFacts`：最终回答原样保留的固定关键事实数

线上回答可能进行同义改写，因此 `answerFacts` 是教学用的严格字符串指标，不等同于完整的
语义正确率。真实项目应使用规则、结构化输出或独立评测器。

轨迹默认写入 `output/<mode>-<strategy>-trajectory.json`，包含最终请求 messages、
压缩指标、模型 usage 和回答。

## 验证

```bash
npm run check --workspace context-compression
npm test --workspace context-compression
npm run build --workspace context-compression
```
