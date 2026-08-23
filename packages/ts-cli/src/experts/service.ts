import { ApiError } from "../errors.js";
import { DEFAULT_USER_AGENT } from "../client.js";
import { matchExperts } from "./match.js";

export async function runExpertMatch(input: {
  topic: string;
  industry?: string;
  importance?: number;
  task?: string;
  expertIds?: string[];
  mode?: string;
  remoteUrl?: string;
}): Promise<Record<string, unknown>> {
  const mode = (input.mode || "local").trim().toLowerCase();
  if (mode !== "local" && mode !== "remote") {
    throw new ApiError("INVALID_PARAM", `expertsMode 仅支持 local|remote，收到：${input.mode}`, {
      exitCode: 1,
    });
  }

  if (mode === "local") {
    const result = matchExperts({
      topic: input.topic,
      industry: input.industry,
      importance: input.importance,
      task: input.task,
      expertIds: input.expertIds,
    });
    return { ...result, service: { mode: "local" } };
  }

  const url = (input.remoteUrl || "").trim();
  if (!url) {
    throw new ApiError(
      "EXPERTS_REMOTE_UNCONFIGURED",
      "专家服务模式为 remote，但 expertsRemoteUrl 为空（待更新）。请改用 local，或配置 ZYT_EXPERTS_REMOTE_URL / .zyt/config.json",
      { exitCode: 1 },
    );
  }

  const payload = {
    topic: input.topic,
    industry: input.industry,
    importance: input.importance ?? 0.5,
    task: input.task || "analysis",
    expertIds: input.expertIds || [],
  };

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": DEFAULT_USER_AGENT,
      },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    throw new ApiError("NETWORK_ERROR", e instanceof Error ? e.message : String(e), { exitCode: 3 });
  }

  const text = await res.text();
  if (!res.ok) {
    throw new ApiError("EXPERTS_REMOTE_ERROR", `远程专家服务 HTTP ${res.status}: ${text.slice(0, 300)}`, {
      httpStatus: res.status,
      exitCode: 3,
    });
  }

  let body: Record<string, unknown>;
  try {
    body = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    throw new ApiError("EXPERTS_REMOTE_ERROR", `远程专家服务返回非 JSON：${text.slice(0, 200)}`, {
      exitCode: 3,
    });
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    body = { data: body };
  }
  return {
    ...body,
    service: { mode: "remote", url, httpStatus: res.status },
  };
}
