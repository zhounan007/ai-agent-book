# 实验 2-6：百炼 + TypeScript Agent Skills PPT

本项目使用 TypeScript 复现第二章 2.5“动态提示词与 Agent Skills”：

- 百炼 `qwen3.7-plus` 通过 OpenAI 兼容 Chat Completions 接口进行 Skill 路由
- Agent 启动时只看到 `name + description` 薄目录
- `read_skill` 加载完整 `SKILL.md`
- `read_skill_file` 按需加载第三层技术资料
- `run_skill_script` 调用白名单 TypeScript 生成器
- `pptxgenjs` 生成可编辑 PPTX，并进行静态布局检查
- LibreOffice + Poppler 生成 PDF 和逐页 PNG，`sharp` 生成 montage

现有 Python 项目保持不变。

## 工作流程

```text
第一层：Skill 薄目录
        │
        ▼
百炼 qwen3.7-plus 判断任务
        │
        ▼
第二层：read_skill("pptx")
        │
        ▼
第三层：read_skill_file("pptx", "reference.md")
        │
        ▼
执行：run_skill_script("generate-pptx")
        │
        ├── presentation.pptx
        ├── presentation.pdf
        ├── presentation-preview/slide-*.png
        ├── presentation-montage.webp
        └── presentation-layout.json
```

## 环境要求

- Node.js 20+
- npm 10+
- LibreOffice（完整预览所需）
- Poppler `pdftoppm`（逐页 PNG 所需）
- 在线模式还需要阿里云百炼 API Key

PPTX 生成只依赖公开 npm 包 `pptxgenjs`。预览阶段使用 `soffice` 将 PPTX
转成 PDF，再使用 `pdftoppm` 导出逐页 PNG。命令不在 `PATH` 时，可通过
`SOFFICE_PATH` 和 `PDFTOPPM_PATH` 指定绝对路径。渲染器会在预览目录中
创建独立的 Fontconfig 缓存；特殊环境仍可通过 `FC_CACHE_PATH` 和
`FONTCONFIG_FILE` 指定字体缓存程序和配置文件。

## 安装

```bash
cd chapter2-nodejs
npm install
```

## 离线模式

离线模式无需百炼 API Key，固定走完与在线模式相同的三个工具通道：

```bash
npm run demo:agent-skills-ppt
```

等价命令：

```bash
cd agent-skills-ppt
npm start -- --offline
```

指定输出：

```bash
npm start -- --offline --output output/offline-demo.pptx
```

离线模式适合在以下位置设置断点：

- `src/skill-registry.ts`：薄目录扫描和按需读取
- `src/tool-dispatcher.ts`：三个 Skill 工具的分发
- `src/generators/pptx.ts`：PptxGenJS 版式与导出
- `src/pptx/layout-checker.ts`：坐标越界与意外重叠检查
- `src/pptx/render-preview.ts`：LibreOffice + Poppler 渲染预览
- `src/main.ts`：离线固定回放顺序

## 在线模式

创建 `.env`：

```bash
cd chapter2-nodejs/agent-skills-ppt
cp env.example .env
```

配置：

```dotenv
DASHSCOPE_API_KEY=你的百炼API_Key
DASHSCOPE_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
DASHSCOPE_MODEL=qwen3.7-plus
MAX_AGENT_TURNS=8
```

程序默认使用 `process.cwd()` 定位 `skills/`、`papers/` 和 `output/`。
从项目目录以外启动时，可显式设置：

```dotenv
AGENT_SKILLS_PPT_ROOT=/absolute/path/to/agent-skills-ppt
```

运行：

```bash
npm run online
```

指定论文、模型和输出：

```bash
npm start -- \
  --paper papers/sample-paper.md \
  --model qwen3.7-plus \
  --output output/online-demo.pptx
```

在线模式由模型自主决定何时调用：

1. `read_skill`
2. `read_skill_file`
3. `run_skill_script`

## 调试

仓库 `.vscode/launch.json` 已提供：

- `Chapter 2 Node.js: Agent Skills PPT 离线`
- `Chapter 2 Node.js: Agent Skills PPT 百炼在线`

在线调试读取本项目 `.env`，不会把 API Key 写进调试配置。

推荐断点顺序：

1. `SkillRegistry.scan`
2. `AgentSkillsPptAgent.run`
3. `ToolDispatcher.execute`
4. `generatePptx`
5. `buildDeck`

## 验证

```bash
cd chapter2-nodejs
npm run check
npm test
npm run build
```

离线生成后，还应检查：

- 输出 PPTX 是否可重新渲染
- 所有逐页 PNG 是否无裁切、溢出和意外重叠
- montage 的视觉节奏是否一致
- `presentation-layout.json` 中是否没有布局问题
- PPTX 是否保留每页 `[Sources]` speaker notes

## 项目结构

```text
agent-skills-ppt/
├── papers/
│   ├── sample-paper.md
│   └── sample-outline.json
├── skills/pptx/
│   ├── SKILL.md
│   └── reference.md
├── src/
│   ├── agent.ts
│   ├── config.ts
│   ├── generators/pptx.ts
│   ├── main.ts
│   ├── pptx/
│   │   ├── layout-checker.ts
│   │   └── render-preview.ts
│   ├── skill-registry.ts
│   └── tool-dispatcher.ts
├── tests/
├── env.example
├── package.json
└── tsconfig.json
```
