import { buildPriceVolumeSvg } from "./chart-svg.js";
import { matchExperts } from "./match.js";
import { runExpertMatch } from "./service.js";
import type { ExpertProfile } from "./load.js";

export const AGENT_VERSION = "2026.08.12-2";
export const DEFAULT_CODES = ["SH_PRICE", "SH_VOL"];

export const OUTPUT_CONTRACT = {
  mustContinueAfterCli: true,
  maxAnalysts: 3,
  analystTagFormat: "【分析员 · {expert_id} · {title}】",
  recommendTagFormat: "【推荐 · {expert_id} · {title}】",
  chart: "Codex：写入 .svg 文件+对话给路径/表；Cursor：可贴 chartSvg.markdown。禁止在 Codex 终端倾倒 SVG 源码",
  followups: "文末正好 3 个推荐问题",
  recommendedExperts: "最多 3 位，且不与正文分析员重复",
  forbid: [
    "只返回匹配 JSON",
    "真名",
    "金句签名",
    "Mermaid 代替图",
    "在 Codex 终端聊天里贴大段 SVG 源码",
    "把 SVG 包进代码围栏（Cursor）",
  ],
};

type FetchFn = (
  method: string,
  path: string,
  query?: Record<string, string | number | undefined | null>,
  body?: unknown,
) => Promise<unknown>;

function slimExpert(scored: Record<string, any>): Record<string, unknown> {
  const expert = (scored.expert || {}) as ExpertProfile;
  const persona = (expert.persona || {}) as Record<string, any>;
  const cogn = (persona.cognition || {}) as Record<string, any>;
  const method = (expert.method || {}) as Record<string, any>;
  const models = ((cogn.mentalModels as any[]) || [])
    .filter((m) => m && typeof m === "object")
    .slice(0, 5)
    .map((m) => ({
      name: m.name,
      summary: String(m.summary || "").slice(0, 160),
      applicationContext: m.applicationContext || "",
    }));
  const id = scored.expert_id || expert.expert_id;
  const title = scored.title || expert.title;
  return {
    expert_id: id,
    title,
    tag: `【分析员 · ${id} · ${title}】`,
    matchScore: scored.matchScore,
    matchReason: scored.matchReason || [],
    domain: expert.domain || [],
    frameworks: ((method.frameworks as string[]) || []).slice(0, 6),
    reasoning: String(method.reasoning || "").slice(0, 240),
    mentalModel: String(cogn.mentalModel || "").slice(0, 240),
    mentalModels: models,
    decisionStyle: String(cogn.decisionStyle || "").slice(0, 200),
    bias: ((persona.bias as string[]) || []).slice(0, 5),
  };
}

function recommendExperts(match: Record<string, any>, limit = 3): Record<string, unknown>[] {
  const selectedIds = new Set((match.selected || []).map((s: any) => s.expert_id));
  const out: Record<string, unknown>[] = [];
  for (const c of match.candidates || []) {
    const eid = c.expert_id;
    if (!eid || selectedIds.has(eid)) continue;
    const title = c.title || eid;
    out.push({
      expert_id: eid,
      title,
      tag: `【推荐 · ${eid} · ${title}】`,
      matchScore: c.matchScore,
      matchReason: c.matchReason || [],
      why: "候选池未入选，框架可互补",
    });
    if (out.length >= limit) break;
  }
  return out;
}

function chartFromSeries(code: string, series: any[]): Record<string, unknown> {
  return {
    code,
    points: (series || []).map((row) => ({
      period: row?.period,
      value: row?.value,
      display_value: row?.display_value,
      mom: row?.mom,
      yoy: row?.yoy,
    })),
  };
}

function followups(city: string, codes: string[]): Array<{ question: string; suggestedCommand: string }> {
  const codeHint = (codes.slice(0, 2).join(",") || "SH_PRICE,SH_VOL");
  return [
    {
      question: `${city}与上海近 12 个月谁成交更强？`,
      suggestedCommand: `zyt 多城对比 --城市列表 ${city},上海 --指标 SH_VOL --json`,
    },
    {
      question: `${city}各行政区成交分布如何？`,
      suggestedCommand: `zyt 行政区分布 --城市 ${city} --指标 SH_VOL --json`,
    },
    {
      question: `${city}价量（${codeHint}）拉长到 24 期怎么走？`,
      suggestedCommand:
        `zyt 批量时序 --城市 ${city} --查询 '[{"code":"SH_PRICE"},{"code":"SH_VOL"}]' --期数 24 --json`,
    },
  ];
}

export function buildBrief(input: {
  city: string;
  topic: string;
  industry?: string;
  importance?: number;
  task?: string;
  codes?: string[];
  limit?: number;
  expertIds?: string[];
  identity?: Record<string, any>;
  seriesPayload?: Record<string, any>;
  match?: Record<string, any>;
}): Record<string, unknown> {
  const codes = input.codes?.length ? input.codes : [...DEFAULT_CODES];
  const limit = input.limit ?? 12;
  const industry = input.industry ?? "房地产";
  const importance = input.importance ?? 0.9;
  const task = input.task ?? "analysis";
  const match =
    input.match ||
    matchExperts({
      topic: input.topic,
      industry,
      importance,
      task,
      expertIds: input.expertIds,
    });

  const analysts = ((match.selected as any[]) || []).slice(0, 3).map((s) => slimExpert(s));
  const charts: Record<string, unknown>[] = [];
  const seriesByCode: Record<string, unknown> = {};
  for (const item of (input.seriesPayload?.results as any[]) || []) {
    const code = String(item?.code || "");
    const series = item?.series || [];
    seriesByCode[code] = {
      code,
      indexed: item?.indexed,
      granularity: item?.granularity,
      latest: (series || [])[series.length - 1] || null,
      series,
    };
    charts.push(chartFromSeries(code, series));
  }

  const pricePts = (charts.find((c) => c.code === "SH_PRICE")?.points as any[]) || [];
  const volPts = (charts.find((c) => c.code === "SH_VOL")?.points as any[]) || [];
  let periodEnd = (input.seriesPayload?.periodEnd as string | undefined) || undefined;
  if (!periodEnd && pricePts.length) periodEnd = pricePts[pricePts.length - 1]?.period;
  const chartSvg =
    pricePts.length || volPts.length
      ? buildPriceVolumeSvg({
          city: input.city,
          pricePoints: pricePts,
          volumePoints: volPts,
          periodEnd,
        })
      : null;

  const cities = input.identity?.cities || [];
  const dataView = input.identity?.dataView;

  return {
    zytAgentVersion: AGENT_VERSION,
    command: "解读",
    city: input.city,
    topic: input.topic,
    industry,
    importance,
    task,
    codes,
    limit,
    identity: {
      cities,
      dataView,
      cityAllowed: !cities.length || cities.includes(input.city),
    },
    data: {
      periodEnd: input.seriesPayload?.periodEnd ?? null,
      dataView: input.seriesPayload?.dataView ?? dataView,
      seriesByCode,
    },
    charts,
    chartSvg,
    analysts,
    recommendedExperts: recommendExperts(match, 3),
    followupQuestions: followups(input.city, codes),
    matchMeta: {
      mode: match.mode,
      poolMode: match.poolMode,
      service: match.service,
      candidateCount: (match.candidates || []).length,
    },
    outputContract: OUTPUT_CONTRACT,
    renderHints: {
      order: [
        "数据底稿（表）",
        "原样粘贴 chartSvg.markdown（仅 Cursor；Codex 改写 .svg 文件）",
        "最多3位【分析员 · id · title】解读",
        "三分析员对照表",
        "推荐继续问×3",
        "推荐专家×≤3",
      ],
      chartRule: "Codex：Write chartSvg.svg 到文件并给路径；Cursor：可贴 markdown。禁止终端倾倒 SVG 源码",
      promptDoc: null,
    },
  };
}

export async function runBrief(input: {
  city: string;
  topic: string;
  industry?: string;
  importance?: number;
  task?: string;
  codes?: string[];
  limit?: number;
  expertIds?: string[];
  expertsMode?: string;
  expertsRemoteUrl?: string;
  fetch: FetchFn;
}): Promise<Record<string, unknown>> {
  const codes = input.codes?.length ? input.codes : [...DEFAULT_CODES];
  const limit = input.limit ?? 12;
  const identity = (await input.fetch("GET", "/openapi/v1/me")) as Record<string, any>;
  const seriesPayload = (await input.fetch(
    "POST",
    "/openapi/v1/indicators/batch-series",
    undefined,
    {
      city: input.city,
      queries: codes.map((code) => ({ code })),
      limit,
    },
  )) as Record<string, any>;
  const match = await runExpertMatch({
    topic: input.topic,
    industry: input.industry ?? "房地产",
    importance: input.importance ?? 0.9,
    task: input.task ?? "analysis",
    expertIds: input.expertIds,
    mode: input.expertsMode,
    remoteUrl: input.expertsRemoteUrl,
  });
  return buildBrief({
    city: input.city,
    topic: input.topic,
    industry: input.industry,
    importance: input.importance,
    task: input.task,
    codes,
    limit,
    expertIds: input.expertIds,
    identity,
    seriesPayload,
    match,
  });
}
