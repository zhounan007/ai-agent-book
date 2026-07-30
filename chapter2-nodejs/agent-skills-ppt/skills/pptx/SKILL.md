---
name: pptx
description: 从论文、大纲或结构化文本生成 PowerPoint (.pptx) 演示文稿。Use when 用户要求把论文、文章或大纲制作成 PPT、slides、deck。Don't use when 只需要纯文本总结、Word/PDF，或修改已有 PPTX 的局部样式。
---

# pptx Skill：从论文生成演示文稿

## 核心流程（第二层）

将论文或大纲转成 8–12 页演示文稿：

1. 通读来源，识别标题、问题、方法、证据、局限和结论。
2. 规划累进式叙事，不要把目录当作叙事本身。
3. 每页只承担一个表达任务，标题直接说出核心结论。
4. 每页保留 2–4 个高价值要点，删掉重复内容。
5. 调用 `read_skill_file` 读取 `reference.md`，获得版式与验收细则。
6. 调用 `run_skill_script`，脚本名使用 `generate-pptx`，payload 使用下方 JSON。

## `run_skill_script` 调用约定

```json
{
  "name": "pptx",
  "script": "generate-pptx",
  "payload": {
    "title": "演示文稿标题",
    "subtitle": "作者或来源",
    "slides": [
      {
        "title": "结论式页标题",
        "bullets": ["要点一", "要点二", "要点三"]
      }
    ]
  }
}
```

约束：

- `slides` 必须为 7–11 项，加上标题页后总页数为 8–12 页。
- 第一页内容通常承担议程或问题定义，最后一页必须完成总结。
- 不得编造来源文本没有提供的数据、人物或结论。
- 输出必须包含 `.pptx`、逐页预览 PNG 和整套缩略图。

## 第三层资料

- `reference.md`：Codex Grid 版式、字体、来源注释和验证规则。
- `src/generators/pptx.ts`：TypeScript PptxGenJS 生成器源码。
