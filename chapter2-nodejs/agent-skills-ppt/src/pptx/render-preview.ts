import { execFile } from "node:child_process";
import { access, mkdir, readdir, unlink } from "node:fs/promises";
import { delimiter, dirname, isAbsolute, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface RenderedPreview {
  pdfPath: string;
  previewDirectory: string;
  slidePaths: string[];
}

async function executableCandidates(
  configured: string | undefined,
  names: string[],
): Promise<string[]> {
  const candidates = [configured?.trim(), ...names].filter(
    (candidate): candidate is string => Boolean(candidate),
  );
  const existing: string[] = [];
  for (const candidate of candidates) {
    const paths = isAbsolute(candidate)
      ? [candidate]
      : (process.env.PATH ?? "")
          .split(delimiter)
          .filter(Boolean)
          .map((directory) => resolve(directory, candidate));
    for (const path of paths) {
      try {
        await access(path);
        existing.push(path);
        break;
      } catch {
        // Try the next PATH directory or known executable location.
      }
    }
  }
  return [...new Set(existing)];
}

async function runFirstAvailable(
  label: string,
  candidates: string[],
  args: string[],
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const failures: string[] = [];
  for (const executable of candidates) {
    try {
      await execFileAsync(executable, args, {
        env,
        maxBuffer: 10 * 1024 * 1024,
      });
      return;
    } catch (error) {
      const code =
        error instanceof Error && "code" in error ? String(error.code) : "";
      if (code === "ENOENT") {
        failures.push(executable);
        continue;
      }
      throw error;
    }
  }
  throw new Error(
    `找不到 ${label}：${failures.join(", ") || "没有可用候选路径"}。` +
      `请安装 ${label} 或配置对应环境变量。`,
  );
}

async function firstExisting(paths: string[]): Promise<string | undefined> {
  for (const path of paths) {
    try {
      await access(path);
      return path;
    } catch {
      // Try the next derived path.
    }
  }
  return undefined;
}

async function prepareFontEnvironment(
  previewDirectory: string,
  sofficePath: string,
  pdftoppmPath: string,
): Promise<{ env: NodeJS.ProcessEnv; profileUrl: string }> {
  const cacheDirectory = resolve(previewDirectory, ".render-cache");
  const profileDirectory = resolve(cacheDirectory, "libreoffice-profile");
  await mkdir(resolve(cacheDirectory, "fontconfig"), { recursive: true });
  await mkdir(profileDirectory, { recursive: true });

  const fontConfigPath =
    process.env.FONTCONFIG_FILE ??
    (await firstExisting([
      resolve(
        dirname(sofficePath),
        "../Resources/fontconfig/fonts.conf",
      ),
      resolve(
        dirname(sofficePath),
        "../../native/libreoffice-headless/libreoffice/LibreOfficeDev.app/Contents/Resources/fontconfig/fonts.conf",
      ),
    ]));
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    XDG_CACHE_HOME: cacheDirectory,
    ...(fontConfigPath ? { FONTCONFIG_FILE: fontConfigPath } : {}),
  };

  const fcCacheCandidates = await executableCandidates(
    process.env.FC_CACHE_PATH,
    ["fc-cache"],
  );
  const derivedFcCache = await firstExisting([
    resolve(dirname(pdftoppmPath), "fc-cache"),
    resolve(
      dirname(pdftoppmPath),
      "../../native/poppler/poppler/bin/fc-cache",
    ),
  ]);
  if (derivedFcCache) {
    fcCacheCandidates.unshift(derivedFcCache);
  }
  if (fontConfigPath && fcCacheCandidates.length) {
    await runFirstAvailable(
      "Fontconfig fc-cache",
      [...new Set(fcCacheCandidates)],
      ["-f"],
      env,
    );
  }

  return {
    env,
    profileUrl: pathToFileURL(profileDirectory).href,
  };
}

function slideNumber(path: string): number {
  const match = /-(\d+)\.png$/i.exec(path);
  return match ? Number.parseInt(match[1]!, 10) : Number.MAX_SAFE_INTEGER;
}

export async function renderPptxPreview(
  pptxPath: string,
  previewDirectory: string,
): Promise<RenderedPreview> {
  const absolutePptx = resolve(pptxPath);
  const outputDirectory = dirname(absolutePptx);
  const pdfPath = absolutePptx.replace(/\.pptx$/i, ".pdf");
  await mkdir(previewDirectory, { recursive: true });
  const staleSlides = (await readdir(previewDirectory)).filter((name) =>
    /^slide-\d+\.png$/i.test(name),
  );
  await Promise.all(
    staleSlides.map(async (name) => {
      await unlink(resolve(previewDirectory, name));
    }),
  );

  const sofficeCandidates = await executableCandidates(
    process.env.SOFFICE_PATH,
    [
      "soffice",
      "/Applications/LibreOffice.app/Contents/MacOS/soffice",
    ],
  );
  const pdftoppmCandidates = await executableCandidates(
    process.env.PDFTOPPM_PATH,
    ["pdftoppm"],
  );
  if (!sofficeCandidates.length) {
    throw new Error("找不到 LibreOffice，请安装或配置 SOFFICE_PATH。");
  }
  if (!pdftoppmCandidates.length) {
    throw new Error("找不到 Poppler pdftoppm，请安装或配置 PDFTOPPM_PATH。");
  }
  const renderEnvironment = await prepareFontEnvironment(
    previewDirectory,
    sofficeCandidates[0]!,
    pdftoppmCandidates[0]!,
  );
  await runFirstAvailable("LibreOffice", sofficeCandidates, [
    `-env:UserInstallation=${renderEnvironment.profileUrl}`,
    "--headless",
    "--convert-to",
    "pdf",
    "--outdir",
    outputDirectory,
    absolutePptx,
  ], renderEnvironment.env);

  const prefix = resolve(previewDirectory, "slide");
  await runFirstAvailable("Poppler pdftoppm", pdftoppmCandidates, [
    "-png",
    "-r",
    "144",
    pdfPath,
    prefix,
  ], renderEnvironment.env);

  const slidePaths = (await readdir(previewDirectory))
    .filter((name) => /^slide-\d+\.png$/i.test(name))
    .map((name) => resolve(previewDirectory, name))
    .sort((left, right) => slideNumber(left) - slideNumber(right));
  if (!slidePaths.length) {
    throw new Error("PPTX 已转换为 PDF，但没有生成逐页 PNG。");
  }
  return { pdfPath, previewDirectory, slidePaths };
}
