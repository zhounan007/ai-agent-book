# 第 1 章 · Node.js / TypeScript 版

本目录是 `chapter1/` Python 示例的 Node.js 对照实现。Python 版保持不变，Node.js
版使用 TypeScript、ESM 和 npm workspaces。

## 环境要求

- Node.js 20+
- npm 10+

## 安装与验证

```bash
cd chapter1-nodejs
npm install
npm run check
npm test
```

## 当前进度

| 项目 | 状态 |
|---|---|
| `web-search-agent` | 已转换 |
| `search-codegen` | 待转换 |
| `context` | 待转换 |
| `learning-from-experience` | 待转换 |

运行 Web Search Agent 离线演示：

```bash
npm run demo:web-search
```
