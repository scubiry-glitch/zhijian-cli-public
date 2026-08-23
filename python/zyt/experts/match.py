from __future__ import annotations

import re
from typing import Any

from . import index_by_id, load_library

_PUNCT_SPLIT = re.compile(r"[^\w\u4e00-\u9fff]+", re.UNICODE)

# 场景 → 主领域（按《专家分类框架_v1》）；靠前规则优先
_ROUTE_RULES: list[tuple[str, tuple[str, ...]]] = [
    ("行业研究", ("月度", "季度", "量价", "见底", "房价", "成交", "库存", "挂牌", "市场研判", "走势", "楼市", "价量")),
    ("政策制度", ("政策", "调控", "政治局", "保障房", "长效机制", "公积金", "现房销售", "住房制度")),
    ("宏观经济", ("宏观", "利率", "汇率", "信贷", "财政", "reits", "地方债", "货币", "关税")),
    ("城市发展", ("城市更新", "都市圈", "人口", "土地", "规划", "城镇化", "片区")),
    ("居住服务", ("经纪", "中介", "租赁", "家装", "物业", "渠道", "流通")),
]


def infer_route_domain(topic: str) -> dict[str, Any]:
    """根据议题推断主责领域；月度/量价类强制偏「行业研究」。"""
    t = topic or ""
    tl = t.lower()
    monthly_keys = ("月度", "季度", "量价", "见底", "房价", "成交", "库存", "挂牌", "走势", "价量", "市场研判")
    force_industry = any(k in t for k in monthly_keys)
    if force_industry:
        return {
            "primaryDomain": "行业研究",
            "forceIndustryResearch": True,
            "reason": "月度/量价类市场研判 → 行业研究主答",
        }
    for domain, keys in _ROUTE_RULES:
        for k in keys:
            if k.lower() in tl or k in t:
                return {
                    "primaryDomain": domain,
                    "forceIndustryResearch": domain == "行业研究",
                    "reason": f"议题命中「{k}」→ {domain}",
                }
    return {"primaryDomain": None, "forceIndustryResearch": False, "reason": "未识别场景，不偏置主领域"}


def primary_domain_of(expert: dict[str, Any]) -> str | None:
    c = expert.get("classification") or {}
    pd = c.get("primaryDomain")
    if pd:
        return str(pd)
    domain = expert.get("domain") or []
    return str(domain[0]) if domain else None


def tokenize(text: str) -> list[str]:
    """简易中英分词：整词 + 中文 2~4 字滑动窗。"""
    if not text:
        return []
    tokens: set[str] = set()
    for part in _PUNCT_SPLIT.split(text.strip().lower()):
        if not part:
            continue
        if re.search(r"[\u4e00-\u9fff]", part):
            if len(part) >= 2:
                tokens.add(part)
            for n in (2, 3, 4):
                for i in range(0, max(0, len(part) - n + 1)):
                    tokens.add(part[i : i + n])
        elif len(part) >= 2:
            tokens.add(part)
    return list(tokens)


def _join_domain(domain: list[str]) -> str:
    return " ".join(domain or []).lower()


def score_expert(
    expert: dict[str, Any],
    *,
    topic: str,
    topic_tokens: list[str],
    industry: str | None,
    task: str,
    preferred_domain: str | None = None,
) -> dict[str, Any]:
    """六维打分，满分 130；另加主领域路由加分 0-30（月度研判偏行业研究）。"""
    reasons: list[str] = []
    total = 0
    domain = [str(x) for x in (expert.get("domain") or [])]
    domain_blob = _join_domain(domain)
    topic_l = (topic or "").lower()
    industry_l = (industry or "").strip().lower()
    p_domain = primary_domain_of(expert)

    # 1 领域 0-40：双向，每词 +15
    domain_hits: list[str] = []
    for d in domain:
        dl = d.lower()
        if dl and dl in topic_l:
            domain_hits.append(d)
    for tok in topic_tokens:
        if tok and tok in domain_blob and tok not in {h.lower() for h in domain_hits}:
            # 只记有意义命中（避免单字）
            if len(tok) >= 2:
                domain_hits.append(tok)
    domain_score = min(40, 15 * len(domain_hits))
    if domain_score:
        reasons.append(f"领域+{domain_score}（{', '.join(domain_hits[:6])}）")
    total += domain_score

    # 2 行业 0-20：一票制
    industry_score = 0
    if industry_l:
        if industry_l in domain_blob or industry_l in topic_l:
            industry_score = 20
            reasons.append(f"行业+20（{industry}）")
        else:
            # 议题分词命中 industry 字面也算（传了 industry）
            for tok in topic_tokens:
                if tok and (tok in industry_l or industry_l in tok):
                    industry_score = 20
                    reasons.append(f"行业+20（{industry}）")
                    break
            # 专家 domain 与 industry 交叉
            if not industry_score:
                for d in domain:
                    if industry_l in d.lower() or d.lower() in industry_l:
                        industry_score = 20
                        reasons.append(f"行业+20（{industry}↔{d}）")
                        break
    total += industry_score

    # 3 分析框架 0-20
    frameworks = [str(x) for x in ((expert.get("method") or {}).get("frameworks") or [])]
    fw_blob = " ".join(frameworks).lower()
    fw_hits = [t for t in topic_tokens if t and t in fw_blob]
    # also framework term in topic
    for fw in frameworks:
        fl = fw.lower()
        if fl and fl in topic_l and fl not in fw_hits:
            fw_hits.append(fw)
    fw_score = min(20, 10 * len(set(fw_hits)))
    if fw_score:
        reasons.append(f"框架+{fw_score}")
    total += fw_score

    # 4 偏好 0-10
    biases = [str(x) for x in ((expert.get("persona") or {}).get("bias") or [])]
    bias_blob = " ".join(biases).lower()
    bias_hits = []
    for b in biases:
        bl = b.lower()
        if bl and bl in topic_l:
            bias_hits.append(b)
    for tok in topic_tokens:
        if tok and tok in bias_blob and tok not in {h.lower() for h in bias_hits}:
            bias_hits.append(tok)
    bias_score = min(10, 5 * len(bias_hits)) if bias_hits else 0
    # 规范：偏好匹配 0-10，双向命中；按命中给分，有命中至少体现
    if bias_hits and bias_score == 0:
        bias_score = 5
    if len(bias_hits) >= 2:
        bias_score = 10
    elif len(bias_hits) == 1:
        bias_score = min(10, max(bias_score, 5))
    if bias_score:
        reasons.append(f"偏好+{bias_score}")
    total += bias_score

    # 5 任务类型 0-10
    method = expert.get("method") or {}
    task_score = 0
    task_l = (task or "analysis").lower()
    if task_l == "evaluation" and method.get("reviewLens"):
        task_score = 10
        reasons.append("任务+10（evaluation×reviewLens）")
    elif task_l == "analysis" and method.get("reasoning"):
        task_score = 5
        reasons.append("任务+5（analysis×reasoning）")
    total += task_score

    # 6 心智模型 0-30
    models = ((expert.get("persona") or {}).get("cognition") or {}).get("mentalModels") or []
    mm_hits = []
    for m in models:
        if not isinstance(m, dict):
            continue
        ctx = str(m.get("applicationContext") or "")
        name = str(m.get("name") or "")
        blob = f"{ctx} {name}".lower()
        hit = False
        if ctx and any(tok in blob for tok in topic_tokens if len(tok) >= 2):
            hit = True
        if not hit and ctx and any(tok in topic_l for tok in tokenize(ctx) if len(tok) >= 2):
            hit = True
        # 议题前缀：前 8 字
        prefix = topic_l[:8]
        if not hit and prefix and prefix in blob:
            hit = True
        if hit:
            mm_hits.append(name or ctx or "model")
    mm_score = min(30, 10 * len(mm_hits))
    if mm_score:
        reasons.append(f"心智+{mm_score}（{', '.join(mm_hits[:4])}）")
    total += mm_score

    # 7 主领域路由 0-30（不计入原 130 封顶内的叙事，但累加后封顶 160）
    route_score = 0
    if preferred_domain and p_domain == preferred_domain:
        route_score = 30
        reasons.append(f"主领域+30（{p_domain}）")
    elif preferred_domain and p_domain:
        # 辅领域命中半额
        sec = ((expert.get("classification") or {}).get("secondaryDomain")) or None
        if sec == preferred_domain:
            route_score = 12
            reasons.append(f"辅领域+12（{sec}）")
    total += route_score

    total = min(160, total)
    return {
        "expert_id": expert.get("expert_id"),
        "title": expert.get("title"),
        "series": expert.get("series"),
        "primaryDomain": p_domain,
        "matchScore": total,
        "matchReason": reasons,
        "mentalModelNames": [
            m.get("name")
            for m in models
            if isinstance(m, dict) and m.get("name")
        ],
        "expert": expert,
    }


def complementary_pick(ranked: list[dict[str, Any]], k: int = 3) -> list[dict[str, Any]]:
    """认知互补：先最高相关，再综合分 = match×0.6 + 新颖心智数×10×0.4。"""
    if not ranked:
        return []
    selected: list[dict[str, Any]] = [ranked[0]]
    used_models: set[str] = set(ranked[0].get("mentalModelNames") or [])
    rest = ranked[1:]
    while len(selected) < k and rest:
        best_i = 0
        best_score = -1.0
        for i, cand in enumerate(rest):
            names = set(cand.get("mentalModelNames") or [])
            novel = len(names - used_models)
            # 无 mentalModels 时退化为纯相关度（novel=0 → 综合=match*0.6）
            combo = cand["matchScore"] * 0.6 + novel * 10 * 0.4
            if combo > best_score:
                best_score = combo
                best_i = i
        pick = rest.pop(best_i)
        selected.append(pick)
        used_models |= set(pick.get("mentalModelNames") or [])
    return selected


def match_experts(
    *,
    topic: str,
    industry: str | None = None,
    importance: float = 0.5,
    task: str = "analysis",
    expert_ids: list[str] | None = None,
    library: dict[str, Any] | None = None,
) -> dict[str, Any]:
    lib = library or load_library()
    by_id = index_by_id(lib)
    topic_tokens = tokenize(topic)
    route = infer_route_domain(topic)
    preferred = route.get("primaryDomain")

    # 显式指定：不走匹配池
    if expert_ids:
        picked = []
        missing = []
        expert_ids = expert_ids[:3]
        for eid in expert_ids:
            if eid in by_id:
                e = by_id[eid]
                sc = score_expert(
                    e,
                    topic=topic,
                    topic_tokens=topic_tokens,
                    industry=industry,
                    task=task,
                    preferred_domain=preferred,
                )
                picked.append(sc)
            else:
                missing.append(eid)
        return {
            "mode": "explicit",
            "topic": topic,
            "industry": industry,
            "importance": importance,
            "task": task,
            "route": route,
            "poolMode": "explicit",
            "candidates": picked,
            "selected": picked,
            "seniorExpert": None,
            "missing": missing,
        }

    experts = list(lib.get("experts") or [])
    # 本仓库仅维护 BK 系列，全部进入默认匹配池
    domain_pool = [e for e in experts if str(e.get("expert_id", "")).startswith("BK")]
    pool_mode = "BK"

    scored = [
        score_expert(
            e,
            topic=topic,
            topic_tokens=topic_tokens,
            industry=industry,
            task=task,
            preferred_domain=preferred,
        )
        for e in domain_pool
    ]
    scored.sort(key=lambda x: x["matchScore"], reverse=True)
    candidates = [x for x in scored if x["matchScore"] > 0][:6]
    selected = complementary_pick(candidates, 3)

    # 月度研判：确保首位（或至少一位）为行业研究主领域
    if route.get("forceIndustryResearch") and selected:
        if not any(s.get("primaryDomain") == "行业研究" for s in selected):
            industry_cands = [c for c in candidates if c.get("primaryDomain") == "行业研究"]
            if industry_cands:
                selected = [industry_cands[0]] + [s for s in selected if s.get("expert_id") != industry_cands[0].get("expert_id")]
                selected = selected[:3]
        elif selected[0].get("primaryDomain") != "行业研究":
            # 把行业研究提到第一位
            for i, s in enumerate(selected):
                if s.get("primaryDomain") == "行业研究":
                    selected = [selected[i]] + selected[:i] + selected[i + 1 :]
                    break

    return {
        "mode": "match",
        "topic": topic,
        "industry": industry,
        "importance": importance,
        "task": task,
        "route": route,
        "poolMode": pool_mode,
        "libraryCount": lib.get("count"),
        "domainPoolSize": len(domain_pool),
        "candidates": [
            {k: v for k, v in c.items() if k != "expert"} for c in candidates
        ],
        "selected": selected,
        "seniorExpert": None,
        "hint": None,
    }
