import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
// packages/ts-cli/src/experts -> repo root = ../../../../
const repoRoot = path.resolve(here, "../../../..");

export type ExpertProfile = {
  expert_id: string;
  series?: string;
  title?: string;
  domain?: string[];
  persona?: Record<string, unknown>;
  method?: Record<string, unknown>;
  [k: string]: unknown;
};

export type ExpertLibrary = {
  version?: string;
  count?: number;
  note?: string;
  experts: ExpertProfile[];
};

export function libraryPath(): string {
  return process.env.ZYT_EXPERT_LIBRARY || path.join(repoRoot, "docs", "experts", "library.json");
}

export function loadLibrary(p = libraryPath()): ExpertLibrary {
  if (!fs.existsSync(p)) throw new Error(`专家库不存在：${p}`);
  return JSON.parse(fs.readFileSync(p, "utf8")) as ExpertLibrary;
}

export function indexById(lib: ExpertLibrary): Record<string, ExpertProfile> {
  const out: Record<string, ExpertProfile> = {};
  for (const e of lib.experts || []) {
    if (e.expert_id) out[e.expert_id] = e;
  }
  return out;
}
