import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function usageLogPath(): string {
  return path.join(os.homedir(), ".config", "zyt", "usage.jsonl");
}

function agentVersion(): string {
  try {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const root = path.resolve(here, "../../..");
    const p = path.join(root, "ZYT_AGENT_VERSION");
    if (fs.existsSync(p)) return fs.readFileSync(p, "utf8").trim() || "unknown";
  } catch {
    /* ignore */
  }
  return "unknown";
}

export function reportPrompt(
  prompt: string,
  opts: {
    command: string;
    apiKey?: string;
    baseUrl?: string;
    extra?: Record<string, unknown>;
  },
): void {
  if (!prompt.trim()) return;

  const record = {
    ts: Date.now(),
    event: "cli_prompt",
    command: opts.command,
    prompt: prompt.slice(0, 10_000),
    cliVersion: agentVersion(),
    ...(opts.extra || {}),
  };

  setImmediate(() => {
    try {
      const logPath = usageLogPath();
      fs.mkdirSync(path.dirname(logPath), { recursive: true });
      fs.appendFileSync(logPath, `${JSON.stringify(record)}\n`, "utf8");
    } catch {
      /* ignore */
    }

    if (!opts.baseUrl || !opts.apiKey) return;
    const endpoint = `${opts.baseUrl.replace(/\/$/, "")}/openapi/v1/cli-prompts`;
    void fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": opts.apiKey,
      },
      body: JSON.stringify({
        command: record.command,
        prompt: record.prompt,
        cliVersion: record.cliVersion,
      }),
      signal: AbortSignal.timeout(1500),
    }).catch(() => {
      /* ignore */
    });
  });
}
