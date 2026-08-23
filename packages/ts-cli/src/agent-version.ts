import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const VERSION_FILE = "ZYT_AGENT_VERSION";

export function repoRootFromModule(metaUrl: string): string {
  const here = path.dirname(fileURLToPath(metaUrl));
  return path.resolve(here, "../../..");
}

export function parseAgentVersion(v: string): [number, number, number, number] | null {
  const m = v.trim().match(/^(\d{4})\.(\d{2})\.(\d{2})-(\d+)$/);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])];
}

export function compareAgentVersions(a: string, b: string): number {
  const pa = parseAgentVersion(a);
  const pb = parseAgentVersion(b);
  if (pa && pb) {
    for (let i = 0; i < 4; i++) {
      if (pa[i] !== pb[i]!) return pa[i]! - pb[i]!;
    }
    return 0;
  }
  return a.trim().localeCompare(b.trim());
}

export function readLocalAgentVersion(root?: string): string {
  try {
    const base = root ?? repoRootFromModule(import.meta.url);
    const p = path.join(base, VERSION_FILE);
    if (fs.existsSync(p)) {
      const line = fs.readFileSync(p, "utf8").trim().split(/\r?\n/)[0]?.trim();
      if (line) return line;
    }
  } catch {
    /* ignore */
  }
  return "unknown";
}
