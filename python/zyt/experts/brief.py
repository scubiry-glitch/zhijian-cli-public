from __future__ import annotations

from typing import Any, Callable, Optional

from .chart_svg import build_price_volume_svg
from .match import match_experts
from .service import run_expert_match

FetchFn = Callable[[str, str, Optional[dict[str, Any]], Any], Any]

DEFAULT_CODES = ["SH_PRICE", "SH_VOL"]
AGENT_VERSION = "2026.08.12-2"

OUTPUT_CONTRACT = {
    "mustContinueAfterCli": True,
    "maxAnalysts": 3,
    "analystTagFormat": "【分析员 · {expert_id} · {title}】",
    "recommendTagFormat": "【推荐 · {expert_id} · {title}】",
    "chart": "Codex：写入 .svg 文件+对话给路径/表；Cursor：可贴 chartSvg.markdown。禁止在 Codex 终端倾倒 SVG 源码",
    "followups": "文末正好 3 个推荐问题",
    "recommendedExperts": "最多 3 位，且不与正文分析员重复",
    "forbid": [
      "只返回匹配 JSON",
      "真名",
      "金句签名",
      "Mermaid 代替图",
      "在 Codex 终端聊天里贴大段 SVG 源码",
      "把 SVG 包进代码围栏（Cursor）",
    ],
}


def _slim_expert(scored: dict[str, Any]) -> dict[str, Any]:
    expert = scored.get("expert") or {}
    persona = expert.get("persona") or {}
    cogn = persona.get("cognition") or {}
    method = expert.get("method") or {}
    models = []
    for m in cogn.get("mentalModels") or []:
        if not isinstance(m, dict):
            continue
        models.append(
            {
                "name": m.get("name"),
                "summary": (m.get("summary") or "")[:160],
                "applicationContext": m.get("applicationContext") or "",
            }
        )
    return {
        "expert_id": scored.get("expert_id") or expert.get("expert_id"),
        "title": scored.get("title") or expert.get("title"),
        "tag": f"【分析员 · {scored.get('expert_id') or expert.get('expert_id')} · {scored.get('title') or expert.get('title')}】",
        "matchScore": scored.get("matchScore"),
        "matchReason": scored.get("matchReason") or [],
        "domain": expert.get("domain") or [],
        "frameworks": (method.get("frameworks") or [])[:6],
        "reasoning": (method.get("reasoning") or "")[:240],
        "mentalModel": (cogn.get("mentalModel") or "")[:240],
        "mentalModels": models[:5],
        "decisionStyle": (cogn.get("decisionStyle") or "")[:200],
        "bias": (persona.get("bias") or [])[:5],
    }


def _recommend_experts(match: dict[str, Any], limit: int = 3) -> list[dict[str, Any]]:
    selected_ids = {s.get("expert_id") for s in (match.get("selected") or [])}
    out: list[dict[str, Any]] = []
    for c in match.get("candidates") or []:
        eid = c.get("expert_id")
        if not eid or eid in selected_ids:
            continue
        title = c.get("title") or eid
        out.append(
            {
                "expert_id": eid,
                "title": title,
                "tag": f"【推荐 · {eid} · {title}】",
                "matchScore": c.get("matchScore"),
                "matchReason": c.get("matchReason") or [],
                "why": "候选池未入选，框架可互补",
            }
        )
        if len(out) >= limit:
            break
    return out


def _chart_from_series(code: str, series: list[dict[str, Any]]) -> dict[str, Any]:
    points = []
    for row in series or []:
        if not isinstance(row, dict):
            continue
        points.append(
            {
                "period": row.get("period"),
                "value": row.get("value"),
                "display_value": row.get("display_value"),
                "mom": row.get("mom"),
                "yoy": row.get("yoy"),
            }
        )
    return {"code": code, "points": points}


def _followups(city: str, codes: list[str]) -> list[dict[str, str]]:
    code_hint = ",".join(codes[:2]) if codes else "SH_PRICE,SH_VOL"
    return [
        {
            "question": f"{city}与上海近 12 个月谁成交更强？",
            "suggestedCommand": f"zyt 多城对比 --城市列表 {city},上海 --指标 SH_VOL --json",
        },
        {
            "question": f"{city}各行政区成交分布如何？",
            "suggestedCommand": f"zyt 行政区分布 --城市 {city} --指标 SH_VOL --json",
        },
        {
            "question": f"{city}价量（{code_hint}）拉长到 24 期怎么走？",
            "suggestedCommand": (
                f"zyt 批量时序 --城市 {city} --查询 "
                f"'[{{\\\"code\\\":\\\"SH_PRICE\\\"}},{{\\\"code\\\":\\\"SH_VOL\\\"}}]' --期数 24 --json"
            ),
        },
    ]


def build_brief(
    *,
    city: str,
    topic: str,
    industry: str | None = "房地产",
    importance: float = 0.9,
    task: str = "analysis",
    codes: list[str] | None = None,
    limit: int = 12,
    expert_ids: list[str] | None = None,
    identity: dict[str, Any] | None = None,
    series_payload: dict[str, Any] | None = None,
    match: dict[str, Any] | None = None,
) -> dict[str, Any]:
    codes = codes or list(DEFAULT_CODES)
    match = match or match_experts(
        topic=topic,
        industry=industry,
        importance=importance,
        task=task,
        expert_ids=expert_ids,
    )

    analysts = [_slim_expert(s) for s in (match.get("selected") or [])[:3]]
    # ensure tag uses 分析员 even if slim used selected without expert blob
    for a in analysts:
        a["tag"] = f"【分析员 · {a.get('expert_id')} · {a.get('title')}】"

    charts: list[dict[str, Any]] = []
    series_by_code: dict[str, Any] = {}
    if isinstance(series_payload, dict):
        for item in series_payload.get("results") or []:
            if not isinstance(item, dict):
                continue
            code = str(item.get("code") or "")
            series = item.get("series") or []
            series_by_code[code] = item
            charts.append(_chart_from_series(code, series))

    price_pts = next((c["points"] for c in charts if c.get("code") == "SH_PRICE"), [])
    vol_pts = next((c["points"] for c in charts if c.get("code") == "SH_VOL"), [])
    period_end = (series_payload or {}).get("periodEnd") if isinstance(series_payload, dict) else None
    if not period_end and price_pts:
        period_end = price_pts[-1].get("period")
    chart_svg = None
    if price_pts or vol_pts:
        chart_svg = build_price_volume_svg(
            city=city,
            price_points=price_pts,
            volume_points=vol_pts,
            period_end=str(period_end) if period_end else None,
        )

    cities = []
    data_view = None
    if isinstance(identity, dict):
        cities = identity.get("cities") or []
        data_view = identity.get("dataView")

    return {
        "zytAgentVersion": AGENT_VERSION,
        "command": "解读",
        "city": city,
        "topic": topic,
        "industry": industry,
        "importance": importance,
        "task": task,
        "codes": codes,
        "limit": limit,
        "identity": {
            "cities": cities,
            "dataView": data_view,
            "cityAllowed": (not cities) or (city in cities),
        },
        "data": {
            "periodEnd": (series_payload or {}).get("periodEnd") if isinstance(series_payload, dict) else None,
            "dataView": (series_payload or {}).get("dataView") if isinstance(series_payload, dict) else data_view,
            "seriesByCode": {
                k: {
                    "code": k,
                    "indexed": v.get("indexed"),
                    "granularity": v.get("granularity"),
                    "latest": (v.get("series") or [None])[-1],
                    "series": v.get("series") or [],
                }
                for k, v in series_by_code.items()
            },
        },
        "charts": charts,
        "chartSvg": chart_svg,
        "analysts": analysts,
        "recommendedExperts": _recommend_experts(match, 3),
        "followupQuestions": _followups(city, codes),
        "matchMeta": {
            "mode": match.get("mode"),
            "poolMode": match.get("poolMode"),
            "service": match.get("service"),
            "candidateCount": len(match.get("candidates") or []),
        },
        "outputContract": OUTPUT_CONTRACT,
        "renderHints": {
            "order": [
                "数据底稿（表）",
                "原样粘贴 chartSvg.markdown（仅 Cursor；Codex 改写 .svg 文件）",
                "最多3位【分析员 · id · title】解读",
                "三分析员对照表",
                "推荐继续问×3",
                "推荐专家×≤3",
            ],
            "chartRule": "Codex：Write chartSvg.svg 到文件并给路径；Cursor：可贴 markdown。禁止终端倾倒 SVG 源码",
            "promptDoc": None,
        },
    }


def run_brief(
    *,
    city: str,
    topic: str,
    industry: str | None = "房地产",
    importance: float = 0.9,
    task: str = "analysis",
    codes: list[str] | None = None,
    limit: int = 12,
    expert_ids: list[str] | None = None,
    experts_mode: str = "local",
    experts_remote_url: str | None = None,
    fetch: FetchFn,
) -> dict[str, Any]:
    codes = codes or list(DEFAULT_CODES)
    identity = fetch("GET", "/openapi/v1/me", None, None)
    series_payload = fetch(
        "POST",
        "/openapi/v1/indicators/batch-series",
        None,
        {
            "city": city,
            "queries": [{"code": c} for c in codes],
            "limit": limit,
        },
    )
    match = run_expert_match(
        topic=topic,
        industry=industry,
        importance=importance,
        task=task,
        expert_ids=expert_ids,
        mode=experts_mode,
        remote_url=experts_remote_url,
    )
    return build_brief(
        city=city,
        topic=topic,
        industry=industry,
        importance=importance,
        task=task,
        codes=codes,
        limit=limit,
        expert_ids=expert_ids,
        identity=identity if isinstance(identity, dict) else {},
        series_payload=series_payload if isinstance(series_payload, dict) else {},
        match=match,
    )
