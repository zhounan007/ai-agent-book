import { readdir, readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { SKILLS_ROOT } from "./project-paths.js";

export interface SkillMetadata {
  name: string;
  description: string;
  directory: string;
  skillFile: string;
}

export const DEFAULT_SKILLS_ROOT = SKILLS_ROOT;

function parseFrontmatter(
  source: string,
  skillFile: string,
): Pick<SkillMetadata, "name" | "description"> {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(source);
  if (!match?.[1]) {
    throw new Error(`${skillFile} 缺少 YAML frontmatter。`);
  }
  const fields = new Map<string, string>();
  for (const line of match[1].split(/\r?\n/)) {
    const separator = line.indexOf(":");
    if (separator <= 0) continue;
    fields.set(line.slice(0, separator).trim(), line.slice(separator + 1).trim());
  }
  const name = fields.get("name");
  const description = fields.get("description");
  if (!name || !description) {
    throw new Error(`${skillFile} 必须包含 name 和 description。`);
  }
  return { name, description };
}

function ensureInside(root: string, target: string): void {
  const relativePath = relative(root, target);
  if (
    relativePath === ".." ||
    relativePath.startsWith(`..${sep}`) ||
    isAbsolute(relativePath)
  ) {
    throw new Error("Skill 文件路径越界。");
  }
}

export class SkillRegistry {
  readonly #skillsRoot: string;
  readonly #skills = new Map<string, SkillMetadata>();

  constructor(skillsRoot = DEFAULT_SKILLS_ROOT) {
    this.#skillsRoot = resolve(skillsRoot);
  }

  async scan(): Promise<SkillMetadata[]> {
    this.#skills.clear();
    let entries;
    try {
      entries = await readdir(this.#skillsRoot, { withFileTypes: true });
    } catch (error) {
      if (
        error instanceof Error &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        throw new Error(
          `Skill 目录不存在：${this.#skillsRoot}。` +
            "请将 cwd 设置为 agent-skills-ppt，或配置 AGENT_SKILLS_PPT_ROOT。",
          { cause: error },
        );
      }
      throw error;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const directory = resolve(this.#skillsRoot, entry.name);
      const skillFile = resolve(directory, "SKILL.md");
      let source: string;
      try {
        source = await readFile(skillFile, "utf8");
      } catch {
        continue;
      }
      const frontmatter = parseFrontmatter(source, skillFile);
      if (this.#skills.has(frontmatter.name)) {
        throw new Error(`Skill 名称重复：${frontmatter.name}`);
      }
      this.#skills.set(frontmatter.name, {
        ...frontmatter,
        directory,
        skillFile,
      });
    }
    return this.list();
  }

  list(): SkillMetadata[] {
    return [...this.#skills.values()].sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }

  thinCatalog(): string {
    return this.list()
      .map((skill) => `- ${skill.name}: ${skill.description}`)
      .join("\n");
  }

  async readSkill(name: string): Promise<string> {
    const skill = this.#require(name);
    return await readFile(skill.skillFile, "utf8");
  }

  async readSkillFile(name: string, requestedPath: string): Promise<string> {
    const skill = this.#require(name);
    if (!requestedPath.trim() || isAbsolute(requestedPath)) {
      throw new Error("Skill 子文件路径必须是非空相对路径。");
    }
    const target = resolve(skill.directory, requestedPath);
    ensureInside(skill.directory, target);
    return await readFile(target, "utf8");
  }

  #require(name: string): SkillMetadata {
    const skill = this.#skills.get(name);
    if (!skill) throw new Error(`未安装 Skill：${name}`);
    return skill;
  }
}
