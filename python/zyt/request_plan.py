from __future__ import annotations

import json
import re
from typing import Any
from urllib.parse import quote


VALUE_FLAGS = {
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
    "--城区": "district",
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
    "--ym": "ym",
    "--年月": "ym",
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
}

BOOL_FLAGS = {
    "--include-peers": ("includePeers", "1"),
    "--含同级": ("includePeers", "1"),
    "--include-city-ref": ("includeCityRef", "1"),
    "--含城市基准": ("includeCityRef", "1"),
    "--markdown": ("markdown", "1"),
    "--md": ("markdown", "1"),
}


def split_argv(argv: list[str]) -> tuple[list[str], list[str]]:
    tokens: list[str] = []
    opt_args: list[str] = []
    i = 0
    while i < len(argv):
        a = argv[i]
        if a == "--json":
            i += 1
            continue
        if a in ("--base-url", "--api-key"):
            i += 2
            continue
        if a.startswith("--base-url=") or a.startswith("--api-key="):
            i += 1
            continue
        if a.startswith("-"):
            opt_args.append(a)
            if a in BOOL_FLAGS:
                i += 1
                continue
            flag = a.split("=", 1)[0]
            if "=" not in a and flag in VALUE_FLAGS:
                if i + 1 < len(argv) and not argv[i + 1].startswith("-"):
                    opt_args.append(argv[i + 1])
                    i += 2
                    continue
            i += 1
            continue
        tokens.append(a)
        i += 1
    return tokens, opt_args


def parse_opts(opt_args: list[str]) -> dict[str, str]:
    opts: dict[str, str] = {}
    i = 0
    while i < len(opt_args):
        a = opt_args[i]
        if a in BOOL_FLAGS:
            k, v = BOOL_FLAGS[a]
            opts[k] = v
            i += 1
            continue
        if "=" in a and a.startswith("--"):
            flag, val = a.split("=", 1)
            key = VALUE_FLAGS.get(flag)
            if key:
                opts[key] = val
            i += 1
            continue
        key = VALUE_FLAGS.get(a)
        if key:
            opts[key] = opt_args[i + 1] if i + 1 < len(opt_args) else ""
            i += 2
            continue
        i += 1
    return opts


def _q(entries: list[tuple[str, str | None]]) -> dict[str, str]:
    return {k: v for k, v in entries if v}


def _require_city(opts: dict[str, str]) -> str:
    city = opts.get("city")
    if not city:
        raise ValueError("缺少必填参数 city/城市")
    return city


def _require_ym(opts: dict[str, str]) -> str:
    ym = opts.get("ym")
    if not ym:
        raise ValueError("缺少必填参数 ym/年月（格式 YYYYMM）")
    if not re.fullmatch(r"\d{4}(0[1-9]|1[0-2])", ym):
        raise ValueError("ym/年月格式错误，应为 YYYYMM（如 202609）")
    return ym


def build_request_plan(argv: list[str]) -> dict[str, Any]:
    tokens, opt_args = split_argv(argv)
    opts = parse_opts(opt_args)
    if not tokens:
        raise ValueError("缺少命令")

    t0 = tokens[0]
    t1 = tokens[1] if len(tokens) > 1 else None

    if t0 in ("配置", "config"):
        action = "set" if t1 in ("设置", "set") else "show"
        return {"command": "配置", "local": True, "action": action}

    if t0 in ("更新", "update"):
        return {"command": "更新", "local": True, "action": "check"}

    # 解读同义词：分析 / 研判 / 点评 / 诊断 …
    _brief_cn = ("解读", "分析", "研判", "点评", "诊断")
    _brief_en = ("brief", "analyze", "analysis", "outlook", "interpret", "解读", "分析", "研判", "点评", "诊断")
    if t0 in _brief_cn or (t0 == "experts" and t1 in _brief_en):
        return {
            "command": "解读",
            "local": True,
            "action": "brief",
            "city": opts.get("city"),
            "topic": opts.get("topic"),
            "industry": opts.get("industry"),
            "importance": opts.get("importance"),
            "task": opts.get("task") or "analysis",
            "code": opts.get("code"),
            "limit": opts.get("limit"),
            "expertId": opts.get("expertId"),
            "expertsMode": opts.get("expertsMode"),
            "expertsRemoteUrl": opts.get("expertsRemoteUrl"),
            "markdown": bool(opts.get("markdown")),
            "chartOut": opts.get("chartOut"),
        }

    if t0 in ("专家匹配", "experts") and (t0 == "专家匹配" or t1 in ("match", "匹配", None)):
        return {
            "command": "专家匹配",
            "local": True,
            "action": "match",
            "topic": opts.get("topic"),
            "industry": opts.get("industry"),
            "importance": opts.get("importance"),
            "task": opts.get("task") or "analysis",
            "expertId": opts.get("expertId"),
            "expertsMode": opts.get("expertsMode"),
            "expertsRemoteUrl": opts.get("expertsRemoteUrl"),
        }

    if t0 in ("身份", "me"):
        return {
            "command": "身份",
            "method": "GET",
            "path": "/openapi/v1/me",
            "query": {},
            "body": None,
        }

    if t0 == "indicators":
        return _indicators(t1 or "", opts)
    if t0 == "geo":
        return _geo(t1 or "", opts)
    if t0 == "reports":
        return _reports(tokens, opts)
    if t0 in ("policies", "政策列表"):
        return {
            "command": "政策列表",
            "method": "GET",
            "path": "/openapi/v1/policies",
            "query": _q([("city", opts.get("city")), ("category", opts.get("category"))]),
            "body": None,
        }
    if t0 in ("districts", "行政区分布"):
        return _districts(opts)
    if t0 in ("market-snapshot", "市场快照"):
        return _market(opts)
    if t0 in ("city-report2026", "城市专报"):
        return _city_report_2026(t1, opts)
    if t0 in ("creis", "中指"):
        return _creis(t1, opts)

    mapping = {
        "指标目录": lambda: {
            "command": "指标目录",
            "method": "GET",
            "path": "/openapi/v1/indicators/catalog",
            "query": {},
            "body": None,
        },
        "指标时序": lambda: _series(opts),
        "批量时序": lambda: _batch(opts),
        "多城对比": lambda: _compare(opts),
        "地理数据包": lambda: _scope(opts),
        "地理时序": lambda: _geo_series(opts),
        "地理树": lambda: {
            "command": "地理树",
            "method": "GET",
            "path": "/openapi/v1/geo/tree",
            "query": _q([("city", _require_city(opts))]),
            "body": None,
        },
        "地理搜索": lambda: _geo_search(opts),
        "报告列表": lambda: {
            "command": "报告列表",
            "method": "GET",
            "path": "/openapi/v1/reports",
            "query": _q([("city", opts.get("city")), ("period", opts.get("period"))]),
            "body": None,
        },
        "报告详情": lambda: _report_detail(t1),
    }
    if t0 in mapping:
        return mapping[t0]()
    raise ValueError(f"未知命令: {t0}")


def _city_report_2026(sub: str | None, opts: dict[str, str]) -> dict[str, Any]:
    # 城市专报2026：城市级 / 面积结构 / 城区级 / 总价结构（city、ym 必填；城区级 district 可选）
    city_ym: list[tuple[str, str | None]] = [
        ("city", _require_city(opts)),
        ("ym", _require_ym(opts)),
    ]
    if sub in ("city", "城市级"):
        return {
            "command": "城市专报城市级",
            "method": "GET",
            "path": "/openapi/v1/city-report2026/city",
            "query": _q(city_ym),
            "body": None,
        }
    if sub in ("area", "面积"):
        return {
            "command": "城市专报面积结构",
            "method": "GET",
            "path": "/openapi/v1/city-report2026/area",
            "query": _q(city_ym),
            "body": None,
        }
    if sub in ("district", "城区"):
        return {
            "command": "城市专报城区级",
            "method": "GET",
            "path": "/openapi/v1/city-report2026/district",
            "query": _q(city_ym + [("district", opts.get("district"))]),
            "body": None,
        }
    if sub in ("total-price", "总价"):
        return {
            "command": "城市专报总价结构",
            "method": "GET",
            "path": "/openapi/v1/city-report2026/total-price",
            "query": _q(city_ym),
            "body": None,
        }
    raise ValueError(f"未知城市专报子命令: {sub}（可选：city/area/district/total-price）")


def _creis(sub: str | None, opts: dict[str, str]) -> dict[str, Any]:
    # 中指 CREIS：土地统计/土地明细/新房统计/新房项目/二手统计。
    # 土地明细该表无 year_month，仅按 city；其余子命令 city、ym 均必填（ym 格式 YYYYMM）。
    if sub in ("land-transaction", "土地明细"):
        return {
            "command": "中指土地明细",
            "method": "GET",
            "path": "/openapi/v1/creis/land-transaction",
            "query": _q([("city", _require_city(opts))]),
            "body": None,
        }
    city_ym: list[tuple[str, str | None]] = [
        ("city", _require_city(opts)),
        ("ym", _require_ym(opts)),
    ]
    if sub in ("land-market", "土地统计"):
        return {
            "command": "中指土地统计",
            "method": "GET",
            "path": "/openapi/v1/creis/land-market",
            "query": _q(city_ym),
            "body": None,
        }
    if sub in ("new-home-market", "新房统计"):
        return {
            "command": "中指新房统计",
            "method": "GET",
            "path": "/openapi/v1/creis/new-home-market",
            "query": _q(city_ym),
            "body": None,
        }
    if sub in ("new-home-project", "新房项目"):
        return {
            "command": "中指新房项目",
            "method": "GET",
            "path": "/openapi/v1/creis/new-home-project",
            "query": _q(city_ym),
            "body": None,
        }
    if sub in ("resale-market", "二手统计"):
        return {
            "command": "中指二手统计",
            "method": "GET",
            "path": "/openapi/v1/creis/resale-market",
            "query": _q(city_ym),
            "body": None,
        }
    raise ValueError(
        f"未知中指子命令: {sub}（可选：land-market/land-transaction/new-home-market/new-home-project/resale-market）"
    )


def _indicators(sub: str, opts: dict[str, str]) -> dict[str, Any]:
    if sub == "catalog":
        return {
            "command": "指标目录",
            "method": "GET",
            "path": "/openapi/v1/indicators/catalog",
            "query": {},
            "body": None,
        }
    if sub == "series":
        return _series(opts)
    if sub == "batch-series":
        return _batch(opts)
    if sub == "compare":
        return _compare(opts)
    raise ValueError(f"未知 indicators 子命令: {sub}")


def _geo(sub: str, opts: dict[str, str]) -> dict[str, Any]:
    if sub == "scope-bundle":
        return _scope(opts)
    if sub == "series":
        return _geo_series(opts)
    if sub == "tree":
        return {
            "command": "地理树",
            "method": "GET",
            "path": "/openapi/v1/geo/tree",
            "query": _q([("city", _require_city(opts))]),
            "body": None,
        }
    if sub == "search":
        return _geo_search(opts)
    raise ValueError(f"未知 geo 子命令: {sub}")


def _reports(tokens: list[str], opts: dict[str, str]) -> dict[str, Any]:
    sub = tokens[1] if len(tokens) > 1 else None
    if sub is None or sub == "list":
        return {
            "command": "报告列表",
            "method": "GET",
            "path": "/openapi/v1/reports",
            "query": _q([("city", opts.get("city")), ("period", opts.get("period"))]),
            "body": None,
        }
    if sub == "get":
        rid = tokens[2] if len(tokens) > 2 else None
        return _report_detail(rid)
    return _report_detail(sub)


def _report_detail(rid: str | None) -> dict[str, Any]:
    if not rid:
        raise ValueError("缺少报告 id")
    return {
        "command": "报告详情",
        "method": "GET",
        "path": f"/openapi/v1/reports/{quote(rid, safe='')}",
        "query": {},
        "body": None,
    }


def _series(opts: dict[str, str]) -> dict[str, Any]:
    code = opts.get("code")
    if not code:
        raise ValueError("缺少必填参数 code/指标")
    return {
        "command": "指标时序",
        "method": "GET",
        "path": "/openapi/v1/indicators/series",
        "query": _q(
            [
                ("city", _require_city(opts)),
                ("code", code),
                ("granularity", opts.get("granularity")),
                ("district", opts.get("district")),
                ("bizcircle", opts.get("bizcircle")),
                ("community", opts.get("community")),
                ("periodEnd", opts.get("periodEnd")),
                ("limit", opts.get("limit")),
                ("caliber", opts.get("caliber")),
            ]
        ),
        "body": None,
    }


def _batch(opts: dict[str, str]) -> dict[str, Any]:
    city = _require_city(opts)
    raw = opts.get("queries")
    if not raw:
        raise ValueError("缺少必填参数 queries/查询（或先由 CLI 展开 --queries-file）")
    queries = json.loads(raw)
    body: dict[str, Any] = {"city": city, "queries": queries}
    if opts.get("periodEnd"):
        body["periodEnd"] = opts["periodEnd"]
    if opts.get("limit"):
        body["limit"] = int(opts["limit"])
    return {
        "command": "批量时序",
        "method": "POST",
        "path": "/openapi/v1/indicators/batch-series",
        "query": {},
        "body": body,
    }


def _compare(opts: dict[str, str]) -> dict[str, Any]:
    cities = opts.get("cities")
    if not cities:
        raise ValueError("缺少必填参数 cities/城市列表")
    return {
        "command": "多城对比",
        "method": "GET",
        "path": "/openapi/v1/indicators/compare",
        "query": _q(
            [
                ("cities", cities),
                ("code", opts.get("code")),
                ("period", opts.get("period")),
            ]
        ),
        "body": None,
    }


def _scope(opts: dict[str, str]) -> dict[str, Any]:
    return {
        "command": "地理数据包",
        "method": "GET",
        "path": "/openapi/v1/geo/scope-bundle",
        "query": _q(
            [
                ("city", _require_city(opts)),
                ("geoId", opts.get("geoId")),
                ("periodEnd", opts.get("periodEnd")),
                ("includePeers", opts.get("includePeers")),
                ("includeCityRef", opts.get("includeCityRef")),
            ]
        ),
        "body": None,
    }


def _geo_series(opts: dict[str, str]) -> dict[str, Any]:
    return {
        "command": "地理时序",
        "method": "GET",
        "path": "/openapi/v1/geo/series",
        "query": _q(
            [
                ("city", _require_city(opts)),
                ("code", opts.get("code")),
                ("key", opts.get("key")),
                ("granularity", opts.get("granularity")),
                ("district", opts.get("district")),
                ("bizcircle", opts.get("bizcircle")),
                ("community", opts.get("community")),
                ("periodEnd", opts.get("periodEnd")),
                ("limit", opts.get("limit")),
            ]
        ),
        "body": None,
    }


def _geo_search(opts: dict[str, str]) -> dict[str, Any]:
    q = opts.get("q")
    if not q:
        raise ValueError("缺少必填参数 q/关键词")
    return {
        "command": "地理搜索",
        "method": "GET",
        "path": "/openapi/v1/geo/search",
        "query": _q([("city", _require_city(opts)), ("q", q)]),
        "body": None,
    }


def _districts(opts: dict[str, str]) -> dict[str, Any]:
    return {
        "command": "行政区分布",
        "method": "GET",
        "path": "/openapi/v1/districts",
        "query": _q(
            [
                ("city", _require_city(opts)),
                ("code", opts.get("code")),
                ("period", opts.get("period")),
            ]
        ),
        "body": None,
    }


def _market(opts: dict[str, str]) -> dict[str, Any]:
    return {
        "command": "市场快照",
        "method": "GET",
        "path": "/openapi/v1/market-snapshot",
        "query": _q([("city", _require_city(opts)), ("period", opts.get("period"))]),
        "body": None,
    }
