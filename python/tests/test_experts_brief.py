from __future__ import annotations

from zyt.experts.brief import AGENT_VERSION, OUTPUT_CONTRACT, build_brief


def test_build_brief_offline():
    identity = {"cities": ["北京", "上海"], "dataView": "external"}
    series_payload = {
        "periodEnd": "2026-07",
        "dataView": "external",
        "results": [
            {
                "code": "SH_PRICE",
                "indexed": False,
                "granularity": "month",
                "series": [
                    {"period": "2026-06", "value": 60000, "display_value": "60000"},
                    {"period": "2026-07", "value": 59000, "display_value": "59000"},
                ],
            },
            {
                "code": "SH_VOL",
                "indexed": True,
                "granularity": "month",
                "series": [
                    {"period": "2026-06", "value": 100, "display_value": "100"},
                    {"period": "2026-07", "value": 110, "display_value": "110"},
                ],
            },
        ],
    }
    brief = build_brief(
        city="北京",
        topic="北京楼市见底了吗",
        industry="房地产",
        importance=0.9,
        identity=identity,
        series_payload=series_payload,
    )
    assert brief["zytAgentVersion"] == AGENT_VERSION
    assert brief["command"] == "解读"
    assert brief["identity"]["cityAllowed"] is True
    assert "SH_PRICE" in brief["data"]["seriesByCode"]
    assert len(brief["charts"]) == 2
    assert brief["chartSvg"] is not None
    assert "楼市价量走势" in brief["chartSvg"]["title"]
    assert "BEIJING MARKET" in brief["chartSvg"]["svg"]
    assert "<svg" in brief["chartSvg"]["svg"]
    assert "PRICE" in brief["chartSvg"]["svg"]
    assert "VOLUME" in brief["chartSvg"]["svg"]
    assert 1 <= len(brief["analysts"]) <= 3
    assert all(a["tag"].startswith("【分析员 ·") for a in brief["analysts"])
    assert len(brief["followupQuestions"]) == 3
    assert len(brief["recommendedExperts"]) <= 3
    assert brief["outputContract"]["maxAnalysts"] == OUTPUT_CONTRACT["maxAnalysts"]
    analyst_ids = {a["expert_id"] for a in brief["analysts"]}
    for r in brief["recommendedExperts"]:
        assert r["expert_id"] not in analyst_ids
        assert r["tag"].startswith("【推荐 ·")


def test_city_not_allowed_flag():
    brief = build_brief(
        city="火星",
        topic="测试",
        identity={"cities": ["北京"], "dataView": "external"},
        series_payload={"results": []},
        match={"selected": [], "candidates": [], "mode": "match", "poolMode": "BK"},
    )
    assert brief["identity"]["cityAllowed"] is False
