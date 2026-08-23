import { indexById, loadLibrary, type ExpertLibrary, type ExpertProfile } from "./load.js";

export type ScoredExpert = {
  expert_id: string;
  title?: string;
  series?: string;
  primaryDomain?: string | null;
  matchScore: number;
  matchReason: string[];
  mentalModelNames: string[];
  expert?: ExpertProfile;
};

const ROUTE_RULES: Array<[string, string[]]> = [
  ["行业研究", ["月度", "季度", "量价", "见底", "房价", "成交", "库存", "挂牌", "市场研判", "走势", "楼市", "价量"]],
  ["政策制度", ["政策", "调控", "政治局", "保障房", "长效机制", "公积金", "现房销售", "住房制度"]],
  ["宏观经济", ["宏观", "利率", "汇率", "信贷", "财政", "reits", "地方债", "货币", "关税"]],
  ["城市发展", ["城市更新", "都市圈", "人口", "土地", "规划", "城镇化", "片区"]],
  ["居住服务", ["经纪", "中介", "租赁", "家装", "物业", "渠道", "流通"]],
];

export function inferRouteDomain(topic: string): {
  primaryDomain: string | null;
  forceIndustryResearch: boolean;
  reason: string;
} {
  const t = topic || "";
  const tl = t.toLowerCase();
  const monthlyKeys = ["月度", "季度", "量价", "见底", "房价", "成交", "库存", "挂牌", "走势", "价量", "市场研判"];
  if (monthlyKeys.some((k) => t.includes(k))) {
    return {
      primaryDomain: "行业研究",
      forceIndustryResearch: true,
      reason: "月度/量价类市场研判 → 行业研究主答",
    };
  }
  for (const [domain, keys] of ROUTE_RULES) {
    for (const k of keys) {
      if (tl.includes(k.toLowerCase()) || t.includes(k)) {
        return {
          primaryDomain: domain,
          forceIndustryResearch: domain === "行业研究",
          reason: `议题命中「${k}」→ ${domain}`,
        };
      }
    }
  }
  return { primaryDomain: null, forceIndustryResearch: false, reason: "未识别场景，不偏置主领域" };
}

function primaryDomainOf(expert: ExpertProfile): string | null {
  const c = (expert.classification || {}) as Record<string, unknown>;
  if (c.primaryDomain) return String(c.primaryDomain);
  const domain = expert.domain || [];
  return domain.length ? String(domain[0]) : null;
}

function tokenize(text: string): string[] {
  if (!text) return [];
  const tokens = new Set<string>();
  const parts = text.trim().toLowerCase().split(/[^\w\u4e00-\u9fff]+/u);
  for (const part of parts) {
    if (!part) continue;
    if (/[\u4e00-\u9fff]/u.test(part)) {
      if (part.length >= 2) tokens.add(part);
      for (const n of [2, 3, 4]) {
        for (let i = 0; i <= part.length - n; i++) tokens.add(part.slice(i, i + n));
      }
    } else if (part.length >= 2) {
      tokens.add(part);
    }
  }
  return [...tokens];
}

function scoreExpert(
  expert: ExpertProfile,
  opts: {
    topic: string;
    topicTokens: string[];
    industry?: string;
    task: string;
    preferredDomain?: string | null;
  },
): ScoredExpert {
  const reasons: string[] = [];
  let total = 0;
  const domain = (expert.domain || []).map(String);
  const domainBlob = domain.join(" ").toLowerCase();
  const topicL = (opts.topic || "").toLowerCase();
  const industryL = (opts.industry || "").trim().toLowerCase();
  const pDomain = primaryDomainOf(expert);

  const domainHits: string[] = [];
  for (const d of domain) {
    const dl = d.toLowerCase();
    if (dl && topicL.includes(dl)) domainHits.push(d);
  }
  const hitLower = new Set(domainHits.map((h) => h.toLowerCase()));
  for (const tok of opts.topicTokens) {
    if (tok.length >= 2 && domainBlob.includes(tok) && !hitLower.has(tok)) {
      domainHits.push(tok);
      hitLower.add(tok);
    }
  }
  const domainScore = Math.min(40, 15 * domainHits.length);
  if (domainScore) reasons.push(`领域+${domainScore}（${domainHits.slice(0, 6).join(", ")}）`);
  total += domainScore;

  let industryScore = 0;
  if (industryL) {
    if (domainBlob.includes(industryL) || topicL.includes(industryL)) {
      industryScore = 20;
      reasons.push(`行业+20（${opts.industry}）`);
    } else {
      for (const d of domain) {
        const dl = d.toLowerCase();
        if (dl.includes(industryL) || industryL.includes(dl)) {
          industryScore = 20;
          reasons.push(`行业+20（${opts.industry}↔${d}）`);
          break;
        }
      }
    }
  }
  total += industryScore;

  const method = (expert.method || {}) as Record<string, unknown>;
  const frameworks = ((method.frameworks as string[]) || []).map(String);
  const fwBlob = frameworks.join(" ").toLowerCase();
  const fwHits = new Set<string>();
  for (const tok of opts.topicTokens) if (tok && fwBlob.includes(tok)) fwHits.add(tok);
  for (const fw of frameworks) {
    const fl = fw.toLowerCase();
    if (fl && topicL.includes(fl)) fwHits.add(fw);
  }
  const fwScore = Math.min(20, 10 * fwHits.size);
  if (fwScore) reasons.push(`框架+${fwScore}`);
  total += fwScore;

  const persona = (expert.persona || {}) as Record<string, unknown>;
  const biases = ((persona.bias as string[]) || []).map(String);
  const biasBlob = biases.join(" ").toLowerCase();
  const biasHits: string[] = [];
  for (const b of biases) {
    const bl = b.toLowerCase();
    if (bl && topicL.includes(bl)) biasHits.push(b);
  }
  const biasLower = new Set(biasHits.map((h) => h.toLowerCase()));
  for (const tok of opts.topicTokens) {
    if (tok && biasBlob.includes(tok) && !biasLower.has(tok)) biasHits.push(tok);
  }
  let biasScore = 0;
  if (biasHits.length >= 2) biasScore = 10;
  else if (biasHits.length === 1) biasScore = 5;
  if (biasScore) reasons.push(`偏好+${biasScore}`);
  total += biasScore;

  let taskScore = 0;
  const taskL = (opts.task || "analysis").toLowerCase();
  if (taskL === "evaluation" && method.reviewLens) {
    taskScore = 10;
    reasons.push("任务+10（evaluation×reviewLens）");
  } else if (taskL === "analysis" && method.reasoning) {
    taskScore = 5;
    reasons.push("任务+5（analysis×reasoning）");
  }
  total += taskScore;

  const cogn = (persona.cognition || {}) as Record<string, unknown>;
  const models = (cogn.mentalModels as Array<Record<string, unknown>>) || [];
  const mmHits: string[] = [];
  for (const m of models) {
    const ctx = String(m.applicationContext || "");
    const name = String(m.name || "");
    const blob = `${ctx} ${name}`.toLowerCase();
    let hit = opts.topicTokens.some((tok) => tok.length >= 2 && blob.includes(tok));
    if (!hit && ctx) {
      const ctxToks = tokenize(ctx);
      hit = ctxToks.some((tok) => tok.length >= 2 && topicL.includes(tok));
    }
    const prefix = topicL.slice(0, 8);
    if (!hit && prefix && blob.includes(prefix)) hit = true;
    if (hit) mmHits.push(name || ctx || "model");
  }
  const mmScore = Math.min(30, 10 * mmHits.length);
  if (mmScore) reasons.push(`心智+${mmScore}（${mmHits.slice(0, 4).join(", ")}）`);
  total += mmScore;

  let routeScore = 0;
  if (opts.preferredDomain && pDomain === opts.preferredDomain) {
    routeScore = 30;
    reasons.push(`主领域+30（${pDomain}）`);
  } else if (opts.preferredDomain && pDomain) {
    const c = (expert.classification || {}) as Record<string, unknown>;
    if (c.secondaryDomain === opts.preferredDomain) {
      routeScore = 12;
      reasons.push(`辅领域+12（${c.secondaryDomain}）`);
    }
  }
  total += routeScore;

  return {
    expert_id: expert.expert_id,
    title: expert.title,
    series: expert.series,
    primaryDomain: pDomain,
    matchScore: Math.min(160, total),
    matchReason: reasons,
    mentalModelNames: models.map((m) => String(m.name || "")).filter(Boolean),
    expert,
  };
}

function complementaryPick(ranked: ScoredExpert[], k = 3): ScoredExpert[] {
  if (!ranked.length) return [];
  const selected: ScoredExpert[] = [ranked[0]!];
  const used = new Set(ranked[0]!.mentalModelNames || []);
  const rest = ranked.slice(1);
  while (selected.length < k && rest.length) {
    let bestI = 0;
    let best = -1;
    for (let i = 0; i < rest.length; i++) {
      const names = new Set(rest[i]!.mentalModelNames || []);
      let novel = 0;
      for (const n of names) if (!used.has(n)) novel++;
      const combo = rest[i]!.matchScore * 0.6 + novel * 10 * 0.4;
      if (combo > best) {
        best = combo;
        bestI = i;
      }
    }
    const pick = rest.splice(bestI, 1)[0]!;
    selected.push(pick);
    for (const n of pick.mentalModelNames || []) used.add(n);
  }
  return selected;
}

export function matchExperts(input: {
  topic: string;
  industry?: string;
  importance?: number;
  task?: string;
  expertIds?: string[];
  library?: ExpertLibrary;
}): Record<string, unknown> {
  const lib = input.library || loadLibrary();
  const byId = indexById(lib);
  const topicTokens = tokenize(input.topic);
  const task = input.task || "analysis";
  const importance = input.importance ?? 0.5;
  const route = inferRouteDomain(input.topic);
  const preferred = route.primaryDomain;

  if (input.expertIds?.length) {
    const picked: ScoredExpert[] = [];
    const missing: string[] = [];
    const expertIds = input.expertIds.slice(0, 3);
    for (const eid of expertIds) {
      const e = byId[eid];
      if (!e) {
        missing.push(eid);
        continue;
      }
      picked.push(
        scoreExpert(e, {
          topic: input.topic,
          topicTokens,
          industry: input.industry,
          task,
          preferredDomain: preferred,
        }),
      );
    }
    return {
      mode: "explicit",
      topic: input.topic,
      industry: input.industry,
      importance,
      task,
      route,
      poolMode: "explicit",
      candidates: picked,
      selected: picked,
      seniorExpert: null,
      missing,
    };
  }

  const experts = lib.experts || [];
  const domainPool = experts.filter((e) => String(e.expert_id).startsWith("BK"));
  const poolMode = "BK";

  const scored = domainPool
    .map((e) =>
      scoreExpert(e, {
        topic: input.topic,
        topicTokens,
        industry: input.industry,
        task,
        preferredDomain: preferred,
      }),
    )
    .sort((a, b) => b.matchScore - a.matchScore);
  const candidates = scored.filter((x) => x.matchScore > 0).slice(0, 6);
  let selected = complementaryPick(candidates, 3);

  if (route.forceIndustryResearch && selected.length) {
    if (!selected.some((s) => s.primaryDomain === "行业研究")) {
      const industryCands = candidates.filter((c) => c.primaryDomain === "行业研究");
      if (industryCands[0]) {
        selected = [industryCands[0], ...selected.filter((s) => s.expert_id !== industryCands[0]!.expert_id)].slice(
          0,
          3,
        );
      }
    } else if (selected[0]?.primaryDomain !== "行业研究") {
      const i = selected.findIndex((s) => s.primaryDomain === "行业研究");
      if (i > 0) {
        selected = [selected[i]!, ...selected.slice(0, i), ...selected.slice(i + 1)];
      }
    }
  }

  return {
    mode: "match",
    topic: input.topic,
    industry: input.industry,
    importance,
    task,
    route,
    poolMode,
    libraryCount: lib.count,
    domainPoolSize: domainPool.length,
    candidates: candidates.map(({ expert: _e, ...rest }) => rest),
    selected,
    seniorExpert: null,
    hint: null,
  };
}
