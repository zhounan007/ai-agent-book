import { mkdir, writeFile } from "node:fs/promises";
import { basename, dirname, extname, resolve } from "node:path";
import * as pptxgenModule from "pptxgenjs";
import sharp from "sharp";
import {
  type LayoutBox,
  type LayoutElementKind,
  type SlideLayoutReport,
  SlideLayoutTracker,
} from "../pptx/layout-checker.js";
import { renderPptxPreview } from "../pptx/render-preview.js";

export interface OutlineSlide {
  title: string;
  bullets: string[];
}

export interface PresentationOutline {
  title: string;
  subtitle?: string;
  slides: OutlineSlide[];
}

export interface GeneratePptxOptions {
  outputPath: string;
  sourceLabel: string;
}

export interface GeneratedPresentation {
  path: string;
  slideCount: number;
  pdfPath: string;
  previewDirectory: string;
  montagePath: string;
  layoutReportPath: string;
}

const WIDTH = 13.333;
const HEIGHT = 7.5;
const FONT = "Hiragino Sans GB";
const INK = "000000";
const RULE = "B8BCC4";
const ACCENT = "3D8DFF";
const ACCENT_LIGHT = "D0EDFA";

type PptxOptions = Record<string, unknown>;

interface PptxSlide {
  background: { color: string };
  addText(text: string, options: PptxOptions): void;
  addShape(shape: string, options: PptxOptions): void;
  addNotes(notes: string): void;
}

interface PptxPresentation {
  layout: string;
  author: string;
  company: string;
  subject: string;
  title: string;
  lang: string;
  theme: PptxOptions;
  ShapeType: {
    rect: string;
    line: string;
    ellipse: string;
  };
  addSlide(): PptxSlide;
  writeFile(options: {
    fileName: string;
    compression?: boolean;
  }): Promise<string>;
}

type PptxConstructor = new () => PptxPresentation;

function resolvePptxConstructor(moduleValue: unknown): PptxConstructor {
  let candidate = moduleValue;
  for (let depth = 0; depth < 3; depth += 1) {
    if (typeof candidate === "function") {
      return candidate as PptxConstructor;
    }
    if (
      candidate &&
      typeof candidate === "object" &&
      "default" in candidate
    ) {
      candidate = candidate.default;
      continue;
    }
    break;
  }
  throw new Error("pptxgenjs 模块没有导出可用的 Presentation 构造器。");
}

const PptxGen = resolvePptxConstructor(pptxgenModule);

interface TrackedSlide {
  slide: PptxSlide;
  tracker: SlideLayoutTracker;
}

function ensureOutline(value: unknown): PresentationOutline {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("PPT payload 必须是 JSON 对象。");
  }
  const candidate = value as Partial<PresentationOutline>;
  if (typeof candidate.title !== "string" || !candidate.title.trim()) {
    throw new Error("PPT payload 缺少 title。");
  }
  if (!Array.isArray(candidate.slides)) {
    throw new Error("PPT payload 缺少 slides 数组。");
  }
  if (candidate.slides.length < 7 || candidate.slides.length > 11) {
    throw new Error("slides 必须为 7–11 项，使总页数保持在 8–12 页。");
  }
  const slides = candidate.slides.map((slide, index) => {
    if (
      !slide ||
      typeof slide.title !== "string" ||
      !slide.title.trim() ||
      !Array.isArray(slide.bullets) ||
      slide.bullets.length < 2 ||
      slide.bullets.length > 5 ||
      slide.bullets.some((bullet) => typeof bullet !== "string" || !bullet.trim())
    ) {
      throw new Error(
        `slides[${index}] 必须包含非空 title 和 2–5 条非空 bullets。`,
      );
    }
    return {
      title: slide.title.trim(),
      bullets: slide.bullets.map((bullet) => bullet.trim()),
    };
  });
  return {
    title: candidate.title.trim(),
    ...(typeof candidate.subtitle === "string"
      ? { subtitle: candidate.subtitle.trim() }
      : {}),
    slides,
  };
}

function addTrackedText(
  target: TrackedSlide,
  name: string,
  text: string,
  box: LayoutBox,
  options: PptxOptions,
): void {
  target.tracker.add({ name, kind: "text", ...box });
  target.slide.addText(text, {
    x: box.x,
    y: box.y,
    w: box.w,
    h: box.h,
    fontFace: FONT,
    lang: "zh-CN",
    color: INK,
    margin: 0,
    valign: "top",
    breakLine: false,
    fit: "shrink",
    ...options,
  });
}

function addTrackedShape(
  target: TrackedSlide,
  name: string,
  kind: LayoutElementKind,
  shape: string,
  box: LayoutBox,
  options: PptxOptions,
  allowOverlap = false,
): void {
  target.tracker.add({ name, kind, ...box, allowOverlap });
  target.slide.addShape(shape, {
    x: box.x,
    y: box.y,
    w: box.w,
    h: box.h,
    ...options,
  });
}

function createSlide(
  presentation: PptxPresentation,
  slideNumber: number,
): TrackedSlide {
  const slide = presentation.addSlide();
  slide.background = { color: "FFFFFF" };
  return {
    slide,
    tracker: new SlideLayoutTracker(slideNumber, WIDTH, HEIGHT),
  };
}

function addFooter(target: TrackedSlide, slideNumber: number): void {
  addTrackedText(
    target,
    `footer-${slideNumber}`,
    String(slideNumber).padStart(2, "0"),
    { x: 12.25, y: 6.93, w: 0.65, h: 0.25 },
    { fontSize: 10.5, align: "right", color: "666666" },
  );
}

function addSlideTitle(
  target: TrackedSlide,
  title: string,
  slideNumber: number,
): void {
  addTrackedText(
    target,
    `title-${slideNumber}`,
    title,
    { x: 0.44, y: 0.35, w: 12.45, h: 0.9 },
    { fontSize: 36, bold: true, valign: "mid" },
  );
}

function addSources(slide: PptxSlide, sourceLabel: string): void {
  slide.addNotes(`[Sources]\n- ${sourceLabel}`);
}

function addTitleSlide(
  presentation: PptxPresentation,
  outline: PresentationOutline,
  sourceLabel: string,
): SlideLayoutReport {
  const target = createSlide(presentation, 1);
  addTrackedShape(
    target,
    "title-accent",
    "shape",
    presentation.ShapeType.rect,
    { x: 0.44, y: 1.85, w: 0.12, h: 3.1 },
    { fill: { color: ACCENT }, line: { color: ACCENT, transparency: 100 } },
  );
  addTrackedText(
    target,
    "title-eyebrow",
    "AGENT SKILLS",
    { x: 0.44, y: 0.43, w: 4.3, h: 0.45 },
    { fontSize: 18, bold: true, color: ACCENT },
  );
  addTrackedText(
    target,
    "deck-title",
    outline.title,
    { x: 0.85, y: 1.85, w: 10.75, h: 3.1 },
    { fontSize: 54, bold: true, valign: "bottom" },
  );
  addTrackedText(
    target,
    "deck-subtitle",
    outline.subtitle || "由 TypeScript Agent 生成",
    { x: 0.85, y: 5.38, w: 8.85, h: 0.7 },
    { fontSize: 21, color: "333333" },
  );
  addFooter(target, 1);
  addSources(target.slide, sourceLabel);
  return target.tracker.report();
}

function addAgendaSlide(
  presentation: PptxPresentation,
  content: OutlineSlide,
  slideNumber: number,
  sourceLabel: string,
): SlideLayoutReport {
  const target = createSlide(presentation, slideNumber);
  addSlideTitle(target, content.title, slideNumber);
  content.bullets.forEach((bullet, index) => {
    const y = 2.05 + index * 0.98;
    addTrackedText(
      target,
      `agenda-index-${index + 1}`,
      String(index + 1).padStart(2, "0"),
      { x: 0.44, y, w: 0.8, h: 0.45 },
      { fontSize: 18, bold: true, color: ACCENT },
    );
    addTrackedText(
      target,
      `agenda-text-${index + 1}`,
      bullet,
      { x: 1.65, y: y - 0.04, w: 10.6, h: 0.55 },
      { fontSize: 21, bold: true },
    );
  });
  addFooter(target, slideNumber);
  addSources(target.slide, sourceLabel);
  return target.tracker.report();
}

function addThreeStageSlide(
  presentation: PptxPresentation,
  content: OutlineSlide,
  slideNumber: number,
  sourceLabel: string,
): SlideLayoutReport {
  const target = createSlide(presentation, slideNumber);
  addSlideTitle(target, content.title, slideNumber);
  addTrackedShape(
    target,
    "stage-connector",
    "line",
    presentation.ShapeType.line,
    { x: 1.02, y: 3.5, w: 10.5, h: 0.01 },
    { line: { color: RULE, width: 1.5 } },
    true,
  );
  const lefts = [0.75, 4.7, 8.65];
  for (const [index, bullet] of content.bullets.slice(0, 3).entries()) {
    const x = lefts[index]!;
    addTrackedShape(
      target,
      `stage-dot-${index + 1}`,
      "shape",
      presentation.ShapeType.ellipse,
      { x, y: 3.38, w: 0.25, h: 0.25 },
      {
        fill: { color: index === 1 ? ACCENT : INK },
        line: { color: index === 1 ? ACCENT : INK },
      },
      true,
    );
    addTrackedText(
      target,
      `stage-label-${index + 1}`,
      `0${index + 1}`,
      { x, y: 2.7, w: 0.9, h: 0.4 },
      {
        fontSize: 18,
        bold: true,
        color: index === 1 ? ACCENT : INK,
      },
    );
    addTrackedText(
      target,
      `stage-text-${index + 1}`,
      bullet,
      { x, y: 4.05, w: 3.2, h: 1.55 },
      { fontSize: 21, bold: true },
    );
  }
  addFooter(target, slideNumber);
  addSources(target.slide, sourceLabel);
  return target.tracker.report();
}

function addColumnsSlide(
  presentation: PptxPresentation,
  content: OutlineSlide,
  slideNumber: number,
  sourceLabel: string,
  columns: 2 | 3,
): SlideLayoutReport {
  const target = createSlide(presentation, slideNumber);
  addSlideTitle(target, content.title, slideNumber);
  const width = columns === 2 ? 5.83 : 3.65;
  const gap = columns === 2 ? 0.8 : 0.56;
  const bullets = content.bullets.slice(0, columns);
  for (const [index, bullet] of bullets.entries()) {
    const x = 0.44 + index * (width + gap);
    addTrackedText(
      target,
      `column-index-${index + 1}`,
      `0${index + 1}`,
      { x, y: 2.1, w: 0.9, h: 0.45 },
      { fontSize: 18, bold: true, color: ACCENT },
    );
    addTrackedText(
      target,
      `column-text-${index + 1}`,
      bullet,
      { x, y: 3.05, w: width, h: 2.5 },
      { fontSize: columns === 2 ? 25.5 : 21, bold: true },
    );
  }
  if (content.bullets.length > columns) {
    addTrackedText(
      target,
      "column-support",
      content.bullets.slice(columns).map((item) => `• ${item}`).join("\n"),
      { x: 0.44, y: 5.85, w: 11.65, h: 0.68 },
      { fontSize: 15, color: "444444", breakLine: true },
    );
  }
  addFooter(target, slideNumber);
  addSources(target.slide, sourceLabel);
  return target.tracker.report();
}

function addStatementSlide(
  presentation: PptxPresentation,
  content: OutlineSlide,
  slideNumber: number,
  sourceLabel: string,
): SlideLayoutReport {
  const target = createSlide(presentation, slideNumber);
  addSlideTitle(target, content.title, slideNumber);
  const lead = content.bullets[0]!;
  const support = content.bullets.slice(1).map((item) => `• ${item}`).join("\n\n");
  addTrackedShape(
    target,
    "statement-panel",
    "shape",
    presentation.ShapeType.rect,
    { x: 0.44, y: 2.05, w: 7.7, h: 3.95 },
    {
      fill: { color: ACCENT_LIGHT },
      line: { color: ACCENT_LIGHT, transparency: 100 },
    },
    true,
  );
  addTrackedText(
    target,
    "statement-lead",
    lead,
    { x: 0.82, y: 2.52, w: 6.85, h: 2.9 },
    { fontSize: 36, bold: true, valign: "mid" },
  );
  addTrackedText(
    target,
    "statement-support",
    support,
    { x: 8.75, y: 2.38, w: 3.75, h: 3.35 },
    { fontSize: 18.5, breakLine: true },
  );
  addFooter(target, slideNumber);
  addSources(target.slide, sourceLabel);
  return target.tracker.report();
}

function addClosingSlide(
  presentation: PptxPresentation,
  content: OutlineSlide,
  slideNumber: number,
  sourceLabel: string,
): SlideLayoutReport {
  const target = createSlide(presentation, slideNumber);
  addTrackedText(
    target,
    "closing-eyebrow",
    "核心结论",
    { x: 0.44, y: 0.43, w: 3.1, h: 0.45 },
    { fontSize: 18, bold: true, color: ACCENT },
  );
  addTrackedText(
    target,
    "closing-title",
    content.title,
    { x: 0.44, y: 1.65, w: 10.95, h: 2.6 },
    { fontSize: 51, bold: true, valign: "bottom" },
  );
  addTrackedText(
    target,
    "closing-points",
    content.bullets.map((item) => `• ${item}`).join("\n"),
    { x: 0.44, y: 5.18, w: 10.95, h: 1.25 },
    { fontSize: 18, breakLine: true },
  );
  addFooter(target, slideNumber);
  addSources(target.slide, sourceLabel);
  return target.tracker.report();
}

function buildDeck(
  outline: PresentationOutline,
  sourceLabel: string,
): { presentation: PptxPresentation; reports: SlideLayoutReport[] } {
  const presentation = new PptxGen();
  presentation.layout = "LAYOUT_WIDE";
  presentation.author = "Agent Skills PPT Demo";
  presentation.company = "AI Agent Book";
  presentation.subject = "Chapter 2 Agent Skills";
  presentation.title = outline.title;
  presentation.lang = "zh-CN";
  presentation.theme = {
    headFontFace: FONT,
    bodyFontFace: FONT,
    lang: "zh-CN",
  };

  const reports = [addTitleSlide(presentation, outline, sourceLabel)];
  outline.slides.forEach((content, index) => {
    const slideNumber = index + 2;
    const isLast = index === outline.slides.length - 1;
    if (isLast) {
      reports.push(
        addClosingSlide(presentation, content, slideNumber, sourceLabel),
      );
    } else if (index === 0) {
      reports.push(
        addAgendaSlide(presentation, content, slideNumber, sourceLabel),
      );
    } else if (/三层|流程|阶段/.test(content.title) && content.bullets.length >= 3) {
      reports.push(
        addThreeStageSlide(presentation, content, slideNumber, sourceLabel),
      );
    } else if (index % 3 === 1) {
      reports.push(
        addStatementSlide(presentation, content, slideNumber, sourceLabel),
      );
    } else {
      reports.push(
        addColumnsSlide(
          presentation,
          content,
          slideNumber,
          sourceLabel,
          content.bullets.length >= 3 ? 3 : 2,
        ),
      );
    }
  });
  return { presentation, reports };
}

async function createMontage(
  slidePaths: string[],
  outputPath: string,
): Promise<void> {
  const columns = 3;
  const thumbWidth = 384;
  const thumbHeight = 216;
  const gap = 20;
  const margin = 24;
  const rows = Math.ceil(slidePaths.length / columns);
  const width = margin * 2 + columns * thumbWidth + (columns - 1) * gap;
  const height = margin * 2 + rows * thumbHeight + (rows - 1) * gap;
  const thumbnails = await Promise.all(
    slidePaths.map(async (path) => {
      return await sharp(path)
        .resize(thumbWidth, thumbHeight, {
          fit: "contain",
          background: "#FFFFFF",
        })
        .png()
        .toBuffer();
    }),
  );
  await sharp({
    create: {
      width,
      height,
      channels: 4,
      background: "#F2F2F2",
    },
  })
    .composite(
      thumbnails.map((input, index) => ({
        input,
        left: margin + (index % columns) * (thumbWidth + gap),
        top: margin + Math.floor(index / columns) * (thumbHeight + gap),
      })),
    )
    .webp({ quality: 90 })
    .toFile(outputPath);
}

export async function generatePptx(
  payload: unknown,
  options: GeneratePptxOptions,
): Promise<GeneratedPresentation> {
  const outline = ensureOutline(payload);
  const outputPath = resolve(options.outputPath);
  const outputDirectory = dirname(outputPath);
  const stem = basename(outputPath, extname(outputPath));
  const previewDirectory = resolve(outputDirectory, `${stem}-preview`);
  const montagePath = resolve(outputDirectory, `${stem}-montage.webp`);
  const layoutReportPath = resolve(outputDirectory, `${stem}-layout.json`);
  await mkdir(outputDirectory, { recursive: true });
  await mkdir(previewDirectory, { recursive: true });

  const { presentation, reports } = buildDeck(
    outline,
    options.sourceLabel,
  );
  const issues = reports.flatMap((report) => report.issues);
  await writeFile(
    layoutReportPath,
    JSON.stringify({ width: WIDTH, height: HEIGHT, reports, issues }, null, 2),
    "utf8",
  );
  if (issues.length) {
    throw new Error(
      `静态布局检查失败：${issues.map((issue) => issue.message).join("；")}`,
    );
  }

  await presentation.writeFile({ fileName: outputPath, compression: true });
  const rendered = await renderPptxPreview(outputPath, previewDirectory);
  if (rendered.slidePaths.length !== outline.slides.length + 1) {
    throw new Error(
      `渲染页数异常：期望 ${outline.slides.length + 1}，` +
        `实际 ${rendered.slidePaths.length}。`,
    );
  }
  await createMontage(rendered.slidePaths, montagePath);

  return {
    path: outputPath,
    slideCount: outline.slides.length + 1,
    pdfPath: rendered.pdfPath,
    previewDirectory,
    montagePath,
    layoutReportPath,
  };
}
