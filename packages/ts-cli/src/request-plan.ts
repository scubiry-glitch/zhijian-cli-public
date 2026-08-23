export type RequestPlan = {
  command: string;
  method?: string;
  path?: string;
  query?: Record<string, string>;
  body?: unknown;
  local?: boolean;
  action?: string;
  city?: string;
  code?: string;
  limit?: string;
  topic?: string;
  industry?: string;
  importance?: string;
  task?: string;
  expertId?: string;
  expertsMode?: string;
  expertsRemoteUrl?: string;
  markdown?: boolean;
  chartOut?: string;
};

type Opts = Record<string, string | boolean | undefined>;

function takeFlag(args: string[], names: string[]): string | undefined {
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    for (const name of names) {
      if (a === name) {
        const v = args[i + 1];
        if (v === undefined || v.startsWith("-")) return "";
        return v;
      }
      if (a.startsWith(name + "=")) return a.slice(name.length + 1);
    }
  }
  return undefined;
}

function hasFlag(args: string[], names: string[]): boolean {
  return args.some((a) => names.includes(a));
}

function pick(opts: Opts, ...keys: string[]): string | undefined {
  for (const k of keys) {
    const v = opts[k];
    if (typeof v === "string" && v !== "") return v;
  }
  return undefined;
}

function queryOf(entries: Array<[string, string | undefined]>): Record<string, string> {
  const q: Record<string, string> = {};
  for (const [k, v] of entries) {
    if (v !== undefined && v !== "") q[k] = v;
  }
  return q;
}

/** Strip global flags; return [commandTokens, optionArgs] */
export function splitArgv(argv: string[]): { tokens: string[]; optArgs: string[] } {
  const args = [...argv];
  const optArgs: string[] = [];
  const tokens: string[] = [];
  const globalValueFlags = new Set(["--base-url", "--api-key"]);
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a === "--json") continue;
    if (globalValueFlags.has(a)) {
      i++;
      continue;
    }
    if (a.startsWith("--base-url=") || a.startsWith("--api-key=")) continue;
    if (a.startsWith("-")) {
      optArgs.push(a);
      const next = args[i + 1];
      if (next && !next.startsWith("-") && !a.includes("=") && a !== "--include-peers" && a !== "--含同级" && a !== "--include-city-ref" && a !== "--含城市基准" && a !== "--json" && a !== "--markdown" && a !== "--md") {
        // heuristic: boolean flags listed above; others may take value
        if (
          [
            "--city",
            "--城市",
            "--code",
            "--指标",
            "--cities",
            "--城市列表",
            "--period",
            "--月份",
            "--period-end",
            "--截止月",
            "--limit",
            "--期数",
            "--granularity",
            "--粒度",
            "--district",
            "--行政区",
            "--bizcircle",
            "--商圈",
            "--community",
            "--小区",
            "--caliber",
            "--口径",
            "--geo-id",
            "--地理编码",
            "--q",
            "--query",
            "--关键词",
            "--category",
            "--分类",
            "--queries",
            "--查询",
            "--queries-file",
            "--查询文件",
            "--key",
            "--api-key",
            "--base-url",
            "--topic",
            "--议题",
            "--industry",
            "--行业",
            "--importance",
            "--重要度",
            "--task",
            "--任务",
            "--expert-id",
            "--专家",
            "--experts-mode",
            "--专家模式",
            "--experts-remote-url",
            "--专家服务",
            "--chart-out",
            "--写图",
          ].includes(a)
        ) {
          optArgs.push(next);
          i++;
        }
      }
      continue;
    }
    tokens.push(a);
  }
  return { tokens, optArgs };
}

export function parseOpts(optArgs: string[]): Opts {
  const opts: Opts = {};
  const map: Record<string, string> = {
    "--city": "city",
    "--城市": "city",
    "--code": "code",
    "--指标": "code",
    "--cities": "cities",
    "--城市列表": "cities",
    "--period": "period",
    "--月份": "period",
    "--period-end": "periodEnd",
    "--截止月": "periodEnd",
    "--limit": "limit",
    "--期数": "limit",
    "--granularity": "granularity",
    "--粒度": "granularity",
    "--district": "district",
    "--行政区": "district",
    "--bizcircle": "bizcircle",
    "--商圈": "bizcircle",
    "--community": "community",
    "--小区": "community",
    "--caliber": "caliber",
    "--口径": "caliber",
    "--geo-id": "geoId",
    "--地理编码": "geoId",
    "--q": "q",
    "--query": "q",
    "--关键词": "q",
    "--category": "category",
    "--分类": "category",
    "--queries": "queries",
    "--查询": "queries",
    "--queries-file": "queriesFile",
    "--查询文件": "queriesFile",
    "--key": "key",
    "--api-key": "apiKey",
    "--base-url": "baseUrl",
    "--topic": "topic",
    "--议题": "topic",
    "--industry": "industry",
    "--行业": "industry",
    "--importance": "importance",
    "--重要度": "importance",
    "--task": "task",
    "--任务": "task",
    "--expert-id": "expertId",
    "--专家": "expertId",
    "--experts-mode": "expertsMode",
    "--专家模式": "expertsMode",
    "--experts-remote-url": "expertsRemoteUrl",
    "--专家服务": "expertsRemoteUrl",
    "--chart-out": "chartOut",
    "--写图": "chartOut",
  };

  for (let i = 0; i < optArgs.length; i++) {
    const a = optArgs[i]!;
    if (a === "--include-peers" || a === "--含同级") {
      opts.includePeers = "1";
      continue;
    }
    if (a === "--include-city-ref" || a === "--含城市基准") {
      opts.includeCityRef = "1";
      continue;
    }
    if (a === "--markdown" || a === "--md") {
      opts.markdown = "1";
      continue;
    }
    if (a.includes("=")) {
      const [flag, ...rest] = a.split("=");
      const key = map[flag!];
      if (key) opts[key] = rest.join("=");
      continue;
    }
    const key = map[a];
    if (key) {
      opts[key] = optArgs[i + 1];
      i++;
    }
  }
  return opts;
}

function requireCity(opts: Opts): string {
  const city = pick(opts, "city");
  if (!city) throw new Error("缺少必填参数 city/城市");
  return city;
}

export function buildRequestPlan(argv: string[]): RequestPlan {
  const { tokens, optArgs } = splitArgv(argv);
  const opts = parseOpts(optArgs);
  if (tokens.length === 0) {
    throw new Error("缺少命令");
  }

  const t0 = tokens[0]!;
  const t1 = tokens[1];
  const t2 = tokens[2];

  // 更新 / update
  if (t0 === "更新" || t0 === "update") {
    return { command: "更新", local: true, action: "check" };
  }

  // 配置
  if (t0 === "配置" || t0 === "config") {
    const action = t1 === "设置" || t1 === "set" ? "set" : "show";
    return { command: "配置", local: true, action };
  }

  // 解读同义词：分析 / 研判 / 点评 / 诊断 …
  const briefCn = new Set(["解读", "分析", "研判", "点评", "诊断"]);
  const briefEn = new Set([
    "brief",
    "analyze",
    "analysis",
    "outlook",
    "interpret",
    "解读",
    "分析",
    "研判",
    "点评",
    "诊断",
  ]);
  if (briefCn.has(t0) || (t0 === "experts" && t1 !== undefined && briefEn.has(t1))) {
    return {
      command: "解读",
      local: true,
      action: "brief",
      city: pick(opts, "city"),
      topic: pick(opts, "topic"),
      industry: pick(opts, "industry"),
      importance: pick(opts, "importance"),
      task: pick(opts, "task") || "analysis",
      code: pick(opts, "code"),
      limit: pick(opts, "limit"),
      expertId: pick(opts, "expertId"),
      expertsMode: pick(opts, "expertsMode"),
      expertsRemoteUrl: pick(opts, "expertsRemoteUrl"),
      markdown: opts.markdown === "1" || opts.markdown === true,
      chartOut: pick(opts, "chartOut"),
    };
  }

  // 专家匹配
  if (t0 === "专家匹配" || (t0 === "experts" && (t1 === "match" || t1 === "匹配" || !t1))) {
    return {
      command: "专家匹配",
      local: true,
      action: "match",
      topic: pick(opts, "topic"),
      industry: pick(opts, "industry"),
      importance: pick(opts, "importance"),
      task: pick(opts, "task") || "analysis",
      expertId: pick(opts, "expertId"),
      expertsMode: pick(opts, "expertsMode"),
      expertsRemoteUrl: pick(opts, "expertsRemoteUrl"),
    };
  }

  // 身份 / me
  if (t0 === "身份" || t0 === "me") {
    return { command: "身份", method: "GET", path: "/openapi/v1/me", query: {}, body: null };
  }

  // indicators nested english
  if (t0 === "indicators") {
    return buildIndicators(t1 ?? "", opts, tokens);
  }
  if (t0 === "geo") {
    return buildGeo(t1 ?? "", opts, tokens);
  }
  if (t0 === "reports") {
    return buildReports(t1, t2, opts, tokens);
  }
  if (t0 === "policies") {
    return {
      command: "政策列表",
      method: "GET",
      path: "/openapi/v1/policies",
      query: queryOf([
        ["city", pick(opts, "city")],
        ["category", pick(opts, "category")],
      ]),
      body: null,
    };
  }
  if (t0 === "districts") {
    return districtsPlan(opts);
  }
  if (t0 === "market-snapshot") {
    return marketPlan(opts);
  }

  // Chinese flat commands
  switch (t0) {
    case "指标目录":
      return {
        command: "指标目录",
        method: "GET",
        path: "/openapi/v1/indicators/catalog",
        query: {},
        body: null,
      };
    case "指标时序":
      return seriesPlan(opts);
    case "批量时序":
      return batchPlan(opts);
    case "多城对比":
      return comparePlan(opts);
    case "地理数据包":
      return scopeBundlePlan(opts);
    case "地理时序":
      return geoSeriesPlan(opts);
    case "地理树":
      return {
        command: "地理树",
        method: "GET",
        path: "/openapi/v1/geo/tree",
        query: queryOf([["city", requireCity(opts)]]),
        body: null,
      };
    case "地理搜索": {
      const q = pick(opts, "q");
      if (!q) throw new Error("缺少必填参数 q/关键词");
      return {
        command: "地理搜索",
        method: "GET",
        path: "/openapi/v1/geo/search",
        query: queryOf([
          ["city", requireCity(opts)],
          ["q", q],
        ]),
        body: null,
      };
    }
    case "行政区分布":
      return districtsPlan(opts);
    case "市场快照":
      return marketPlan(opts);
    case "报告列表":
      return {
        command: "报告列表",
        method: "GET",
        path: "/openapi/v1/reports",
        query: queryOf([
          ["city", pick(opts, "city")],
          ["period", pick(opts, "period")],
        ]),
        body: null,
      };
    case "报告详情": {
      const id = t1;
      if (!id) throw new Error("缺少报告 id");
      return {
        command: "报告详情",
        method: "GET",
        path: `/openapi/v1/reports/${encodeURIComponent(id)}`,
        query: {},
        body: null,
      };
    }
    case "政策列表":
      return {
        command: "政策列表",
        method: "GET",
        path: "/openapi/v1/policies",
        query: queryOf([
          ["city", pick(opts, "city")],
          ["category", pick(opts, "category")],
        ]),
        body: null,
      };
    default:
      throw new Error(`未知命令: ${t0}`);
  }
}

function buildIndicators(sub: string, opts: Opts, _tokens: string[]): RequestPlan {
  switch (sub) {
    case "catalog":
      return {
        command: "指标目录",
        method: "GET",
        path: "/openapi/v1/indicators/catalog",
        query: {},
        body: null,
      };
    case "series":
      return seriesPlan(opts);
    case "batch-series":
      return batchPlan(opts);
    case "compare":
      return comparePlan(opts);
    default:
      throw new Error(`未知 indicators 子命令: ${sub}`);
  }
}

function buildGeo(sub: string, opts: Opts, _tokens: string[]): RequestPlan {
  switch (sub) {
    case "scope-bundle":
      return scopeBundlePlan(opts);
    case "series":
      return geoSeriesPlan(opts);
    case "tree":
      return {
        command: "地理树",
        method: "GET",
        path: "/openapi/v1/geo/tree",
        query: queryOf([["city", requireCity(opts)]]),
        body: null,
      };
    case "search": {
      const q = pick(opts, "q");
      if (!q) throw new Error("缺少必填参数 q/关键词");
      return {
        command: "地理搜索",
        method: "GET",
        path: "/openapi/v1/geo/search",
        query: queryOf([
          ["city", requireCity(opts)],
          ["q", q],
        ]),
        body: null,
      };
    }
    default:
      throw new Error(`未知 geo 子命令: ${sub}`);
  }
}

function buildReports(
  sub: string | undefined,
  idOrUndef: string | undefined,
  opts: Opts,
  tokens: string[],
): RequestPlan {
  if (!sub || sub === "list") {
    return {
      command: "报告列表",
      method: "GET",
      path: "/openapi/v1/reports",
      query: queryOf([
        ["city", pick(opts, "city")],
        ["period", pick(opts, "period")],
      ]),
      body: null,
    };
  }
  if (sub === "get") {
    const id = idOrUndef ?? tokens[2];
    if (!id) throw new Error("缺少报告 id");
    return {
      command: "报告详情",
      method: "GET",
      path: `/openapi/v1/reports/${encodeURIComponent(id)}`,
      query: {},
      body: null,
    };
  }
  // reports <id>
  return {
    command: "报告详情",
    method: "GET",
    path: `/openapi/v1/reports/${encodeURIComponent(sub)}`,
    query: {},
    body: null,
  };
}

function seriesPlan(opts: Opts): RequestPlan {
  const code = pick(opts, "code");
  if (!code) throw new Error("缺少必填参数 code/指标");
  return {
    command: "指标时序",
    method: "GET",
    path: "/openapi/v1/indicators/series",
    query: queryOf([
      ["city", requireCity(opts)],
      ["code", code],
      ["granularity", pick(opts, "granularity")],
      ["district", pick(opts, "district")],
      ["bizcircle", pick(opts, "bizcircle")],
      ["community", pick(opts, "community")],
      ["periodEnd", pick(opts, "periodEnd")],
      ["limit", pick(opts, "limit")],
      ["caliber", pick(opts, "caliber")],
    ]),
    body: null,
  };
}

function batchPlan(opts: Opts): RequestPlan {
  const city = requireCity(opts);
  const raw = pick(opts, "queries");
  if (!raw) throw new Error("缺少必填参数 queries/查询（或先由 CLI 展开 --queries-file）");
  const queries = JSON.parse(raw);
  const body: Record<string, unknown> = { city, queries };
  const periodEnd = pick(opts, "periodEnd");
  const limit = pick(opts, "limit");
  if (periodEnd) body.periodEnd = periodEnd;
  if (limit) body.limit = Number(limit);
  return {
    command: "批量时序",
    method: "POST",
    path: "/openapi/v1/indicators/batch-series",
    query: {},
    body,
  };
}

function comparePlan(opts: Opts): RequestPlan {
  const cities = pick(opts, "cities");
  if (!cities) throw new Error("缺少必填参数 cities/城市列表");
  return {
    command: "多城对比",
    method: "GET",
    path: "/openapi/v1/indicators/compare",
    query: queryOf([
      ["cities", cities],
      ["code", pick(opts, "code")],
      ["period", pick(opts, "period")],
    ]),
    body: null,
  };
}

function scopeBundlePlan(opts: Opts): RequestPlan {
  return {
    command: "地理数据包",
    method: "GET",
    path: "/openapi/v1/geo/scope-bundle",
    query: queryOf([
      ["city", requireCity(opts)],
      ["geoId", pick(opts, "geoId")],
      ["periodEnd", pick(opts, "periodEnd")],
      ["includePeers", pick(opts, "includePeers")],
      ["includeCityRef", pick(opts, "includeCityRef")],
    ]),
    body: null,
  };
}

function geoSeriesPlan(opts: Opts): RequestPlan {
  return {
    command: "地理时序",
    method: "GET",
    path: "/openapi/v1/geo/series",
    query: queryOf([
      ["city", requireCity(opts)],
      ["code", pick(opts, "code")],
      ["key", pick(opts, "key")],
      ["granularity", pick(opts, "granularity")],
      ["district", pick(opts, "district")],
      ["bizcircle", pick(opts, "bizcircle")],
      ["community", pick(opts, "community")],
      ["periodEnd", pick(opts, "periodEnd")],
      ["limit", pick(opts, "limit")],
    ]),
    body: null,
  };
}

function districtsPlan(opts: Opts): RequestPlan {
  return {
    command: "行政区分布",
    method: "GET",
    path: "/openapi/v1/districts",
    query: queryOf([
      ["city", requireCity(opts)],
      ["code", pick(opts, "code")],
      ["period", pick(opts, "period")],
    ]),
    body: null,
  };
}

function marketPlan(opts: Opts): RequestPlan {
  return {
    command: "市场快照",
    method: "GET",
    path: "/openapi/v1/market-snapshot",
    query: queryOf([
      ["city", requireCity(opts)],
      ["period", pick(opts, "period")],
    ]),
    body: null,
  };
}

// silence unused helper warning in some bundlers
void takeFlag;
void hasFlag;
