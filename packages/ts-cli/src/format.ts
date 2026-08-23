import { ApiError } from "./errors.js";

export function emitSuccess(data: unknown, json: boolean): void {
  if (json) {
    process.stdout.write(JSON.stringify(data, null, 2) + "\n");
    return;
  }
  process.stdout.write(formatHuman(data) + "\n");
}

export function emitError(err: unknown, json: boolean): number {
  const apiErr =
    err instanceof ApiError
      ? err
      : new ApiError("INTERNAL_ERROR", err instanceof Error ? err.message : String(err), {
          exitCode: 1,
        });

  if (json) {
    const payload: {
      error: { code: string; message: string; httpStatus?: number };
    } = {
      error: {
        code: apiErr.code,
        message: apiErr.message,
      },
    };
    if (apiErr.httpStatus !== undefined) payload.error.httpStatus = apiErr.httpStatus;
    process.stdout.write(JSON.stringify(payload, null, 2) + "\n");
  } else {
    process.stderr.write(`错误 [${apiErr.code}]: ${apiErr.message}\n`);
  }
  return apiErr.exitCode;
}

function formatHuman(data: unknown): string {
  if (data === null || data === undefined) return "";
  if (typeof data !== "object") return String(data);

  if (Array.isArray(data)) {
    return formatTable(data);
  }

  const obj = data as Record<string, unknown>;

  // rows array
  if (Array.isArray(obj.rows)) {
    const head = Object.entries(obj)
      .filter(([k]) => k !== "rows")
      .map(([k, v]) => `${k}: ${fmtVal(v)}`)
      .join("\n");
    return [head, formatTable(obj.rows as unknown[])].filter(Boolean).join("\n\n");
  }

  if (Array.isArray(obj.indicators)) {
    return formatTable(obj.indicators as unknown[]);
  }

  if (Array.isArray(obj.series)) {
    const meta = Object.entries(obj)
      .filter(([k]) => k !== "series")
      .map(([k, v]) => `${k}: ${fmtVal(v)}`)
      .join("\n");
    return [meta, formatTable(obj.series as unknown[])].filter(Boolean).join("\n\n");
  }

  return Object.entries(obj)
    .map(([k, v]) => {
      if (v !== null && typeof v === "object") {
        return `${k}:\n${indent(formatHuman(v))}`;
      }
      return `${k}: ${fmtVal(v)}`;
    })
    .join("\n");
}

function formatTable(rows: unknown[]): string {
  if (rows.length === 0) return "(空)";
  const objects = rows.every((r) => r && typeof r === "object" && !Array.isArray(r));
  if (!objects) return rows.map((r) => `- ${fmtVal(r)}`).join("\n");

  const keySet = new Set<string>();
  for (const r of rows) {
    for (const k of Object.keys(r as object)) keySet.add(k);
  }
  const keys = Array.from(keySet);
  const widths = keys.map((k) =>
    Math.max(k.length, ...rows.map((r) => String((r as Record<string, unknown>)[k] ?? "").length)),
  );
  const line = (cols: string[]) =>
    cols.map((c, i) => c.padEnd(widths[i]!)).join("  ");
  const header = line(keys);
  const sep = widths.map((w) => "-".repeat(w)).join("  ");
  const body = rows.map((r) =>
    line(keys.map((k) => String((r as Record<string, unknown>)[k] ?? ""))),
  );
  return [header, sep, ...body].join("\n");
}

function fmtVal(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function indent(s: string): string {
  return s
    .split("\n")
    .map((l) => `  ${l}`)
    .join("\n");
}
