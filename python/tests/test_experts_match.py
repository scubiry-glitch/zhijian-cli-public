from __future__ import annotations

from zyt.experts.match import (
    complementary_pick,
    infer_route_domain,
    match_experts,
    tokenize,
)
from zyt.experts import load_library


def test_route_monthly_forces_industry():
    r = infer_route_domain("北京楼市见底了吗？近12月量价")
    assert r["primaryDomain"] == "行业研究"
    assert r["forceIndustryResearch"] is True


def test_route_policy():
    r = infer_route_domain("如何理解最新调控政策与长效机制")
    assert r["primaryDomain"] == "政策制度"


def test_match_monthly_prefers_industry_research():
    result = match_experts(
        topic="北京楼市月度量价走势见底了吗",
        industry="房地产",
        importance=0.9,
        task="analysis",
    )
    assert result["route"]["primaryDomain"] == "行业研究"
    assert result["selected"]
    assert result["selected"][0].get("primaryDomain") == "行业研究"
    # 主领域加分应出现在理由中
    assert any("主领域" in (x or "") for x in (result["selected"][0].get("matchReason") or []))


def test_tokenize_has_bigrams():
    toks = tokenize("北京楼市见底了吗")
    assert "北京" in toks
    assert "楼市" in toks


def test_match_with_industry_returns_selected():
    result = match_experts(
        topic="北京楼市见底了吗？最近政策放松后成交如何",
        industry="房地产",
        importance=0.9,
        task="analysis",
    )
    assert result["mode"] == "match"
    assert result["poolMode"] == "BK"
    assert len(result["selected"]) <= 3
    assert all(s["matchScore"] > 0 for s in result["selected"])
    assert all(str(s["expert_id"]).startswith("BK") for s in result["selected"])
    assert result["seniorExpert"] is None


def test_explicit_expert_id():
    lib = load_library()
    eid = lib["experts"][0]["expert_id"]
    result = match_experts(topic="测试议题房地产库存", industry="房地产", expert_ids=[eid])
    assert result["mode"] == "explicit"
    assert result["selected"][0]["expert_id"] == eid


def test_explicit_caps_at_three():
    lib = load_library()
    ids = [e["expert_id"] for e in lib["experts"][:5]]
    result = match_experts(topic="测试议题房地产", industry="房地产", expert_ids=ids)
    assert len(result["selected"]) <= 3
    assert [s["expert_id"] for s in result["selected"]] == ids[:3]


def test_remote_unconfigured():
    from zyt.errors import ApiError
    from zyt.experts.service import run_expert_match

    try:
        run_expert_match(topic="测试", mode="remote", remote_url="")
        assert False, "should raise"
    except ApiError as e:
        assert e.code == "EXPERTS_REMOTE_UNCONFIGURED"


def test_complementary_prefers_novel_models():
    ranked = [
        {"matchScore": 50, "mentalModelNames": ["A", "B"], "expert_id": "1"},
        {"matchScore": 40, "mentalModelNames": ["A", "B"], "expert_id": "2"},
        {"matchScore": 30, "mentalModelNames": ["C", "D"], "expert_id": "3"},
    ]
    picked = complementary_pick(ranked, 2)
    assert picked[0]["expert_id"] == "1"
    assert picked[1]["expert_id"] == "3"
