#!/usr/bin/env node
import fs from "node:fs";
import { loadConfig, saveConfig, DEFAULT_BASE_URL, type ExpertsMode } from "./config.js";
import { ZytClient } from "./client.js";
import { emitError, emitSuccess } from "./format.js";
import { ApiError } from "./errors.js";
import { buildRequestPlan, splitArgv, parseOpts } from "./request-plan.js";
import { runBrief } from "./experts/brief.js";
import { renderBriefMarkdown, writeChartFile } from "./experts/render.js";
import { runExpertMatch } from "./experts/service.js";
import { reportPrompt } from "./telemetry.js";
import { checkUpdate, formatUpdateMessage } from "./update.js";

function extractGlobal(argv: string[]): {
  json: boolean;
  insecure: boolean;
  apiKey?: string;
  baseUrl?: string;
  rest: string[];
} {
  const rest: string[] = [];
  let json = false;
  let insecure = false;
  let apiKey: string | undefined;
  let baseUrl: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--json") {
      json = true;
      continue;
    }
    if (a === "--insecure" || a === "-k") {
      insecure = true;
      continue;
    }
    if (a === "--api-key") {
      apiKey = argv[++i];
      continue;
    }
    if (a.startsWith("--api-key=")) {
      apiKey = a.slice("--api-key=".length);
      continue;
    }
    if (a === "--base-url") {
      baseUrl = argv[++i];
      continue;
    }
    if (a.startsWith("--base-url=")) {
      baseUrl = a.slice("--base-url=".length);
      continue;
    }
    rest.push(a);
  }
  return { json, insecure, apiKey, baseUrl, rest };
}

/** Expand --queries-file into --queries inline JSON for plan builder */
function expandQueriesFile(argv: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--queries-file" || a === "--查询文件") {
      const file = argv[i + 1];
      if (!file) throw new ApiError("MISSING_PARAM", "缺少 --queries-file 路径", { exitCode: 1 });
      const content = fs.readFileSync(file, "utf8");
      out.push("--queries", content.trim());
      i++;
      continue;
    }
    if (a.startsWith("--queries-file=") || a.startsWith("--查询文件=")) {
      const file = a.split("=").slice(1).join("=");
      const content = fs.readFileSync(file, "utf8");
      out.push("--queries", content.trim());
      continue;
    }
    out.push(a);
  }
  return out;
}

async function main(): Promise<number> {
  const rawArgv = process.argv.slice(2);
  if (rawArgv.length === 0 || rawArgv[0] === "-h" || rawArgv[0] === "--help") {
    printHelp();
    return 0;
  }

  const { json, insecure, apiKey, baseUrl, rest } = extractGlobal(rawArgv);
  let argv = rest;

  try {
    argv = expandQueriesFile(argv);
  } catch (e) {
    return emitError(e, json);
  }

  // help for subcommands
  if (argv.includes("-h") || argv.includes("--help")) {
    printHelp();
    return 0;
  }

  let plan;
  try {
    plan = buildRequestPlan(argv);
  } catch (e) {
    return emitError(
      new ApiError("INVALID_PARAM", e instanceof Error ? e.message : String(e), { exitCode: 1 }),
      json,
    );
  }

  if (plan.local) {
    if (plan.command === "更新") {
      try {
        const result = await checkUpdate();
        if (json) {
          emitSuccess(result, true);
        } else {
          process.stdout.write(formatUpdateMessage(result));
        }
        return 0;
      } catch (e) {
        return emitError(e, json);
      }
    }
    if (plan.command === "解读") {
      const city = plan.city || "";
      const topic = plan.topic || "";
      if (!city) {
        return emitError(new ApiError("MISSING_PARAM", "解读需要 --城市/--city", { exitCode: 1 }), json);
      }
      if (!topic) {
        return emitError(new ApiError("MISSING_PARAM", "解读需要 --议题/--topic", { exitCode: 1 }), json);
      }
      const importance = plan.importance ? Number(plan.importance) : 0.9;
      const limit = plan.limit ? Number(plan.limit) : 12;
      const codes = plan.code
        ? String(plan.code)
            .split(/[,，]/)
            .map((s) => s.trim())
            .filter(Boolean)
        : undefined;
      const expertIds = plan.expertId
        ? String(plan.expertId)
            .split(/[,，]/)
            .map((s) => s.trim())
            .filter(Boolean)
        : undefined;
      const cfg = loadConfig({
        apiKey,
        baseUrl,
        insecure: insecure || undefined,
        expertsMode: plan.expertsMode,
        expertsRemoteUrl: plan.expertsRemoteUrl,
      });
      const client = new ZytClient({
        baseUrl: cfg.baseUrl,
        apiKey: cfg.apiKey,
        insecure: cfg.insecure,
      });
      reportPrompt(topic, { command: "解读", apiKey: cfg.apiKey, baseUrl: cfg.baseUrl });
      try {
        const result = (await runBrief({
          city,
          topic,
          industry: plan.industry || "房地产",
          importance: Number.isFinite(importance) ? importance : 0.9,
          task: plan.task || "analysis",
          codes,
          limit: Number.isFinite(limit) ? limit : 12,
          expertIds,
          expertsMode: cfg.expertsMode,
          expertsRemoteUrl: cfg.expertsRemoteUrl,
          fetch: (method, path, query, body) =>
            method.toUpperCase() === "POST"
              ? client.post(path, body)
              : client.get(path, query ?? undefined),
        })) as Record<string, unknown>;
        if (plan.chartOut) {
          writeChartFile(result, plan.chartOut);
        }
        if (plan.markdown) {
          const md = renderBriefMarkdown(result);
          if (json) {
            emitSuccess({ ...result, markdown: md }, true);
          } else {
            process.stdout.write(md.endsWith("\n") ? md : `${md}\n`);
          }
          return 0;
        }
        emitSuccess(result, json);
        return 0;
      } catch (e) {
        return emitError(e, json);
      }
    }
    if (plan.command === "专家匹配") {
      const topic = plan.topic || "";
      if (!topic) {
        return emitError(new ApiError("MISSING_PARAM", "专家匹配需要 --议题/--topic", { exitCode: 1 }), json);
      }
      const importance = plan.importance ? Number(plan.importance) : 0.5;
      const expertIds = plan.expertId
        ? String(plan.expertId)
            .split(/[,，]/)
            .map((s) => s.trim())
            .filter(Boolean)
        : undefined;
      const cfg = loadConfig({
        apiKey,
        baseUrl,
        insecure: insecure || undefined,
        expertsMode: plan.expertsMode,
        expertsRemoteUrl: plan.expertsRemoteUrl,
      });
      reportPrompt(topic, { command: "专家匹配", apiKey: cfg.apiKey, baseUrl: cfg.baseUrl });
      try {
        const result = await runExpertMatch({
          topic,
          industry: plan.industry,
          importance: Number.isFinite(importance) ? importance : 0.5,
          task: plan.task || "analysis",
          expertIds,
          mode: cfg.expertsMode,
          remoteUrl: cfg.expertsRemoteUrl,
        });
        emitSuccess(result, json);
        return 0;
      } catch (e) {
        return emitError(e, json);
      }
    }
    const cfg = loadConfig({ apiKey, baseUrl, insecure: insecure || undefined });
    if (plan.action === "set") {
      const { optArgs } = splitArgv(argv);
      const opts = parseOpts(optArgs);
      // also accept globals already extracted
      const next = saveConfig({
        apiKey: (opts.apiKey as string) || apiKey || loadConfig({}).apiKey,
        baseUrl: (opts.baseUrl as string) || baseUrl || loadConfig({}).baseUrl || DEFAULT_BASE_URL,
        expertsMode: (opts.expertsMode as ExpertsMode) || undefined,
        expertsRemoteUrl:
          opts.expertsRemoteUrl !== undefined ? String(opts.expertsRemoteUrl) : undefined,
      });
      emitSuccess(
        {
          ok: true,
          path: next.path,
          baseUrl: next.baseUrl,
          apiKeySet: Boolean(next.apiKey),
          expertsMode: next.expertsMode,
          expertsRemoteUrl: next.expertsRemoteUrl ?? "",
        },
        json,
      );
      return 0;
    }
    emitSuccess(
      {
        baseUrl: cfg.baseUrl,
        apiKeySet: Boolean(cfg.apiKey),
        apiKeyPreview: cfg.apiKey ? `${cfg.apiKey.slice(0, 4)}…` : null,
        insecure: Boolean(cfg.insecure),
        expertsMode: cfg.expertsMode || "remote",
        expertsRemoteUrl: cfg.expertsRemoteUrl ?? "",
      },
      json,
    );
    return 0;
  }

  const cfg = loadConfig({ apiKey, baseUrl, insecure: insecure || undefined });
  const client = new ZytClient({
    baseUrl: cfg.baseUrl,
    apiKey: cfg.apiKey,
    insecure: cfg.insecure,
  });

  try {
    const data =
      plan.method === "POST"
        ? await client.post(plan.path!, plan.body)
        : await client.get(plan.path!, plan.query);
    emitSuccess(data, json);
    return 0;
  } catch (e) {
    return emitError(e, json);
  }
}

function printHelp(): void {
  const text = `zyt — 贝壳智见开放 API CLI

用法:
  zyt [--json] [--insecure|-k] [--base-url URL] [--api-key KEY] <命令> [选项]

中文命令:
  身份
  指标目录
  指标时序      --城市 <名> --指标 <code> [--粒度] [--行政区] [--商圈] [--小区] [--截止月] [--期数] [--口径]
  批量时序      --城市 <名> --查询 '<json>' | --查询文件 <path> [--截止月] [--期数]
  多城对比      --城市列表 北京,上海 [--指标] [--月份]
  地理数据包    --城市 <名> [--地理编码] [--截止月] [--含同级] [--含城市基准]
  地理时序      --城市 <名> [--指标|--key] [...]
  地理树        --城市 <名>
  地理搜索      --城市 <名> --关键词 <q>
  行政区分布    --城市 <名> [--指标] [--月份]
  市场快照      --城市 <名> [--月份]
  报告列表      [--城市] [--月份]
  报告详情      <id>
  政策列表      [--城市] [--分类]
  城市专报 城市级|面积|城区|总价 --城市 <名> --年月 YYYYMM [--城区 <名>（仅城区子命令）]
  中指 土地统计|新房统计|新房项目|二手统计 --城市 <名> --年月 YYYYMM
  中指 土地明细 --城市 <名>                       （该表无年月，仅按城市）
  配置 查看
  配置 设置     [--api-key KEY] [--base-url URL] [--专家模式 local|remote] [--专家服务 URL]
  更新          检查 GitHub release 分支是否有新版本
  解读|分析|研判|点评|诊断
                --城市 <名> --议题 <文本> [--行业 <名>] [--重要度 0-1] [--任务 analysis|evaluation]
                [--指标 SH_PRICE,SH_VOL] [--期数 12] [--专家 id]
                [--markdown] [--写图 path.svg]
                [--专家模式 local|remote] [--专家服务 URL]
  专家匹配      --议题 <文本> [--行业 <名>] [--重要度 0-1] [--任务 analysis|evaluation] [--专家 id]
                [--专家模式 local|remote] [--专家服务 URL]

研判优先：zyt 解读 --markdown（半成品）与 --写图（SVG 落盘）；专家服务默认 remote，需配置 expertsRemoteUrl。Agent 请加 --json。
英文别名见 docs/command-contract.md。Agent 请加 --json。
`;
  process.stdout.write(text);
}

main().then((code) => {
  process.exitCode = code;
});
