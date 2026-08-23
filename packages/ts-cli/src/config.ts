import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export type ExpertsMode = "local" | "remote";

export type ZytConfig = {
  apiKey?: string;
  baseUrl: string;
  insecure?: boolean;
  /** 专家匹配：local=ZYT_EXPERT_LIBRARY 或 docs/experts；remote=远程服务（发行版默认） */
  expertsMode?: ExpertsMode;
  /** 远程专家服务 URL；暂留空待更新 */
  expertsRemoteUrl?: string;
};

export const DEFAULT_BASE_URL = "https://dss.ke.com";
export const DEFAULT_EXPERTS_MODE: ExpertsMode = "remote";
/** 远程地址占位，待更新 */
export const DEFAULT_EXPERTS_REMOTE_URL = "";

/** 仓库内配置（优先写入，便于 Codex/团队共享包） */
export const PROJECT_CONFIG_REL = path.join(".zyt", "config.json");

export function homeConfigPath(): string {
  return path.join(os.homedir(), ".config", "zyt", "config.json");
}

/** @deprecated 使用 homeConfigPath；保留别名兼容旧测试 */
export function configPath(): string {
  return homeConfigPath();
}

export function findProjectRoot(start = process.cwd()): string | null {
  let dir = path.resolve(start);
  for (;;) {
    const markers = [
      path.join(dir, ".zyt"),
      path.join(dir, "docs", "command-contract.md"),
      path.join(dir, "packages", "ts-cli", "package.json"),
    ];
    if (markers.some((p) => fs.existsSync(p))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

export function projectConfigPath(cwd = process.cwd()): string | null {
  const root = findProjectRoot(cwd);
  return root ? path.join(root, PROJECT_CONFIG_REL) : null;
}

function readJsonFile(p: string): Partial<ZytConfig> {
  if (!fs.existsSync(p)) return {};
  try {
    return JSON.parse(fs.readFileSync(p, "utf8")) as Partial<ZytConfig>;
  } catch {
    return {};
  }
}

export function readProjectConfigFile(cwd = process.cwd()): Partial<ZytConfig> {
  const p = projectConfigPath(cwd);
  return p ? readJsonFile(p) : {};
}

export function readConfigFile(): Partial<ZytConfig> {
  return readJsonFile(homeConfigPath());
}

function normalizeExpertsMode(v: unknown): ExpertsMode | undefined {
  if (v === "local" || v === "remote") return v;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (s === "local" || s === "remote") return s;
  }
  return undefined;
}

export type SaveConfigResult = ZytConfig & { path: string };

export function saveConfig(
  partial: Partial<ZytConfig>,
  opts: { cwd?: string; preferHome?: boolean } = {},
): SaveConfigResult {
  const projectPath = opts.preferHome ? null : projectConfigPath(opts.cwd);
  const target = projectPath ?? homeConfigPath();
  const current = readJsonFile(target);
  const next: ZytConfig = {
    baseUrl: partial.baseUrl ?? current.baseUrl ?? DEFAULT_BASE_URL,
    apiKey: partial.apiKey !== undefined ? partial.apiKey : current.apiKey,
  };
  if (partial.insecure !== undefined) next.insecure = partial.insecure;
  else if (current.insecure !== undefined) next.insecure = current.insecure;

  const mode = normalizeExpertsMode(partial.expertsMode) ?? normalizeExpertsMode(current.expertsMode);
  if (mode) next.expertsMode = mode;
  if (partial.expertsRemoteUrl !== undefined) next.expertsRemoteUrl = partial.expertsRemoteUrl;
  else if (current.expertsRemoteUrl !== undefined) next.expertsRemoteUrl = current.expertsRemoteUrl;

  const toWrite: Record<string, string | boolean> = { baseUrl: next.baseUrl };
  if (next.apiKey) toWrite.apiKey = next.apiKey;
  if (next.insecure) toWrite.insecure = true;
  if (next.expertsMode) toWrite.expertsMode = next.expertsMode;
  if (next.expertsRemoteUrl !== undefined) toWrite.expertsRemoteUrl = next.expertsRemoteUrl;

  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, JSON.stringify(toWrite, null, 2) + "\n");
  return { ...next, path: target };
}

/**
 * 配置优先级：CLI flag > 环境变量 > 仓库 `.zyt/config.json` > `~/.config/zyt/config.json`
 */
export function loadConfig(
  overrides: {
    apiKey?: string;
    baseUrl?: string;
    insecure?: boolean;
    expertsMode?: string;
    expertsRemoteUrl?: string;
  } = {},
  cwd = process.cwd(),
): ZytConfig {
  const project = readProjectConfigFile(cwd);
  const home = readConfigFile();
  const envInsecure =
    process.env.ZYT_INSECURE === "1" || process.env.ZYT_INSECURE === "true";
  const expertsMode =
    normalizeExpertsMode(overrides.expertsMode) ||
    normalizeExpertsMode(process.env.ZYT_EXPERTS_MODE) ||
    normalizeExpertsMode(project.expertsMode) ||
    normalizeExpertsMode(home.expertsMode) ||
    DEFAULT_EXPERTS_MODE;
  const expertsRemoteUrl =
    overrides.expertsRemoteUrl !== undefined
      ? overrides.expertsRemoteUrl
      : process.env.ZYT_EXPERTS_REMOTE_URL !== undefined
        ? process.env.ZYT_EXPERTS_REMOTE_URL
        : project.expertsRemoteUrl !== undefined
          ? project.expertsRemoteUrl
          : home.expertsRemoteUrl !== undefined
            ? home.expertsRemoteUrl
            : DEFAULT_EXPERTS_REMOTE_URL;

  return {
    apiKey: overrides.apiKey || process.env.ZYT_API_KEY || project.apiKey || home.apiKey,
    baseUrl:
      overrides.baseUrl ||
      process.env.ZYT_BASE_URL ||
      project.baseUrl ||
      home.baseUrl ||
      DEFAULT_BASE_URL,
    insecure:
      overrides.insecure !== undefined
        ? overrides.insecure
        : envInsecure || Boolean(project.insecure) || Boolean(home.insecure),
    expertsMode,
    expertsRemoteUrl,
  };
}
