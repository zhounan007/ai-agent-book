# 2.2 API 上下文与工具调用 Demo

本项目把第二章 2.2“Agent 如何调用大模型：理解 API 的上下文结构”整理为
一个可运行的 TypeScript Demo：

- 通过 OpenAI Node.js SDK 调用阿里云百炼的 OpenAI 兼容接口
- 使用 `qwen3.7-plus`
- 展示 `system`、`user`、`assistant`、`tool` 四种消息
- 实现完整的“请求模型 → 执行工具 → 回填结果 → 再次请求”循环
- 通过百度地图开放平台查询国内实时天气
- 打印每轮 `messages`，观察上下文如何增长

## 工作流程

```text
system + user
      │
      ▼
qwen3.7-plus
      │
      ├─ 普通文本 ──────────────────────► 最终回答
      │
      └─ tool_calls
             │
             ├─ get_current_time
             └─ get_current_weather ─────► 百度天气 API
                         │
                         ▼
                assistant + tool 消息
                         │
                         └───────────────► 再次请求模型
```

模型只负责决定调用哪个工具以及生成参数，真正的工具代码由本地 Node.js
程序执行。模型 API 本身无状态，因此第二次请求必须包含前一轮的完整消息。

## 环境要求

- Node.js 20+
- 阿里云百炼 API Key
- 百度地图开放平台服务端 AK，并开通天气查询服务

## 配置

在本项目目录创建 `.env`：

```bash
cp env.example .env
```

填写：

```dotenv
DASHSCOPE_API_KEY=你的百炼API_Key
DASHSCOPE_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
DASHSCOPE_MODEL=qwen3.7-plus

BAIDU_MAP_AK=你的百度地图AK
BAIDU_WEATHER_BASE_URL=https://api.map.baidu.com/weather/v1/
```

API Key 不要写入源码或提交到 Git。

## 安装

从 `chapter2-nodejs` 目录统一安装依赖：

```bash
cd chapter2-nodejs
npm install
```

## 运行

### 完整工具调用案例

```bash
npm run demo:api-context
```

默认问题：

```text
北京市海淀区现在几点，天气怎么样？
```

指定其他国内区县：

```bash
cd api-context-demo
npm start -- tools "上海市浦东新区现在几点，天气怎么样？"
```

程序会依次打印：

1. 第一次请求的 `system + user` 消息
2. 模型返回的 `assistant.tool_calls`
3. 本地应用生成的两条 `tool` 消息
4. 包含完整历史的第二次模型请求
5. 模型最终回答

### 单轮对话案例

```bash
cd api-context-demo
npm run single
```

单轮模式用于观察最简单的 `system + user → assistant` 结构，不提供工具。

### 关闭轨迹输出

```bash
npm start -- tools "北京市海淀区天气怎么样？" --quiet
```

## 验证

测试不访问百炼或百度 API：

```bash
cd chapter2-nodejs
npm run check
npm test
```

## 文件说明

```text
api-context-demo/
├── env.example          # 环境变量模板
├── src/
│   ├── agent.ts         # OpenAI Chat Completions 与 Agent 核心循环
│   ├── config.ts        # 百炼、百度及循环次数配置
│   ├── main.ts          # single/tools 命令行入口和轨迹展示
│   └── tools.ts         # 时间工具与百度天气工具
└── tests/
    ├── agent.test.ts    # 两轮工具调用和消息增长测试
    └── tools.test.ts    # 工具参数、结果映射和错误处理测试
```

## 相关文档

- [阿里云百炼 Function Calling](https://help.aliyun.com/zh/model-studio/qwen-function-calling)
- [百度地图国内天气查询](https://lbsyun.baidu.com/docs/webapi?title=weatherinquiry/weather/base)
