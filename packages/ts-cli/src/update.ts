import { DEFAULT_USER_AGENT } from "./client.js";
import { ApiError } from "./errors.js";
import {
  VERSION_FILE,
  compareAgentVersions,
  parseAgentVersion,
  readLocalAgentVersion,
} from "./agent-version.js";

export const DEFAULT_RELEASE_REPO = "scubiry-glitch/zhijian-cli-public";
export const DEFAULT_RELEASE_BRANCH = "release";

export type UpdateCheckResult = {
  command: "更新";
  repo: string;
  localVersion: string;
  remoteVersion: string;
  remoteBranch: string;
  updateAvailable: boolean;
  upToDate: boolean;
  url: string;
};

function githubToken(): string | undefined {
  return process.env.ZYT_GITHUB_TOKEN || process.env.GITHUB_TOKEN;
}

function privateRepoHint(): string {
  if (githubToken()) return "";
  return " 仓库不存在或无权访问，若使用私有 fork 请设置 ZYT_GITHUB_TOKEN（或 GITHUB_TOKEN，需 repo 读权限）后重试。";
}

function githubHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": DEFAULT_USER_AGENT,
  };
  const token = githubToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

function versionFromBranchName(branch: string): string | null {
  if (!branch.startsWith("release/")) return null;
  const v = branch.slice("release/".length).trim();
  return parseAgentVersion(v) ? v : null;
}

function branchUrl(repo: string, branch: string): string {
  return `https://github.com/${repo}/tree/${branch}`;
}

async function fetchText(url: string, headers: Record<string, string>): Promise<string | null> {
  let res: Response;
  try {
    res = await fetch(url, { headers, signal: AbortSignal.timeout(15_000) });
  } catch (e) {
    throw new ApiError("NETWORK_ERROR", e instanceof Error ? e.message : String(e), { exitCode: 3 });
  }
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new ApiError(
      "RELEASE_CHECK_FAILED",
      `检查发行版失败 HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`,
      { httpStatus: res.status, exitCode: 3 },
    );
  }
  const text = (await res.text()).trim();
  const line = text.split(/\r?\n/)[0]?.trim();
  return line || null;
}

async function fetchVersionFromBranch(repo: string, branch: string): Promise<string | null> {
  const rawUrl = `https://raw.githubusercontent.com/${repo}/${encodeURIComponent(branch)}/${VERSION_FILE}`;
  const raw = await fetchText(rawUrl, { "User-Agent": DEFAULT_USER_AGENT });
  if (raw) return raw;

  const apiUrl = `https://api.github.com/repos/${repo}/contents/${VERSION_FILE}?ref=${encodeURIComponent(branch)}`;
  let res: Response;
  try {
    res = await fetch(apiUrl, { headers: githubHeaders(), signal: AbortSignal.timeout(15_000) });
  } catch (e) {
    throw new ApiError("NETWORK_ERROR", e instanceof Error ? e.message : String(e), { exitCode: 3 });
  }
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new ApiError(
      "RELEASE_CHECK_FAILED",
      `GitHub API 失败 HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`,
      { httpStatus: res.status, exitCode: 3 },
    );
  }
  const body = (await res.json()) as { content?: string };
  if (!body.content) return null;
  const decoded = Buffer.from(body.content.replace(/\n/g, ""), "base64").toString("utf8").trim();
  return decoded.split(/\r?\n/)[0]?.trim() || null;
}

async function listReleaseBranches(repo: string): Promise<string[]> {
  const url = `https://api.github.com/repos/${repo}/branches?per_page=100`;
  let res: Response;
  try {
    res = await fetch(url, { headers: githubHeaders(), signal: AbortSignal.timeout(15_000) });
  } catch (e) {
    throw new ApiError("NETWORK_ERROR", e instanceof Error ? e.message : String(e), { exitCode: 3 });
  }
  if (res.status === 404) {
    throw new ApiError(
      "RELEASE_CHECK_FAILED",
      `仓库不存在或无权访问：${repo}。${privateRepoHint()}`,
      { exitCode: 3 },
    );
  }
  if (!res.ok) {
    throw new ApiError(
      "RELEASE_CHECK_FAILED",
      `列举分支失败 HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`,
      { httpStatus: res.status, exitCode: 3 },
    );
  }
  const branches = (await res.json()) as Array<{ name: string }>;
  return branches
    .map((b) => b.name)
    .filter((name) => name === "release" || name.startsWith("release/"));
}

async function resolveLatestRelease(
  repo: string,
  preferredBranch: string,
): Promise<{ branch: string; version: string }> {
  const preferredVersion = await fetchVersionFromBranch(repo, preferredBranch);
  if (preferredVersion) {
    return { branch: preferredBranch, version: preferredVersion };
  }

  const branches = await listReleaseBranches(repo);
  let best: { branch: string; version: string } | null = null;

  for (const branch of branches) {
    let version = versionFromBranchName(branch);
    if (!version) {
      version = (await fetchVersionFromBranch(repo, branch)) ?? null;
    } else {
      const fileVersion = await fetchVersionFromBranch(repo, branch);
      if (fileVersion) version = fileVersion;
    }
    if (!version || !parseAgentVersion(version)) continue;
    if (!best || compareAgentVersions(version, best.version) > 0) {
      best = { branch, version };
    }
  }

  if (!best) {
    throw new ApiError(
      "RELEASE_CHECK_FAILED",
      `未找到可用发行版分支（尝试 ${preferredBranch} 与 release/*）。${privateRepoHint()}`,
      { exitCode: 3 },
    );
  }
  return best;
}

export async function checkUpdate(opts?: {
  repo?: string;
  branch?: string;
  localVersion?: string;
  fetchImpl?: typeof fetch;
}): Promise<UpdateCheckResult> {
  const repo = (opts?.repo || process.env.ZYT_RELEASE_REPO || DEFAULT_RELEASE_REPO).trim();
  const branch = (opts?.branch || process.env.ZYT_RELEASE_BRANCH || DEFAULT_RELEASE_BRANCH).trim();
  const localVersion = opts?.localVersion ?? readLocalAgentVersion();

  const prevFetch = globalThis.fetch;
  if (opts?.fetchImpl) globalThis.fetch = opts.fetchImpl;
  try {
    const latest = await resolveLatestRelease(repo, branch);
    const updateAvailable = compareAgentVersions(latest.version, localVersion) > 0;
    return {
      command: "更新",
      repo,
      localVersion,
      remoteVersion: latest.version,
      remoteBranch: latest.branch,
      updateAvailable,
      upToDate: !updateAvailable,
      url: branchUrl(repo, latest.branch),
    };
  } finally {
    if (opts?.fetchImpl) globalThis.fetch = prevFetch;
  }
}

export function formatUpdateMessage(result: UpdateCheckResult): string {
  const lines = [
    `当前版本：${result.localVersion}`,
    `远程最新：${result.remoteVersion}（分支 ${result.remoteBranch}）`,
  ];
  if (result.updateAvailable) {
    lines.push(`有可用更新：${result.url}`);
  } else {
    lines.push("已是最新版本。");
  }
  return `${lines.join("\n")}\n`;
}
