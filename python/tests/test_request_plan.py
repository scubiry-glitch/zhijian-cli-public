from __future__ import annotations

import json
import os
from pathlib import Path

from zyt.config import DEFAULT_BASE_URL, load_config, save_config
from zyt.request_plan import build_request_plan


def test_load_config_env(monkeypatch):
    monkeypatch.setenv("ZYT_API_KEY", "btg_env")
    monkeypatch.setenv("ZYT_BASE_URL", "https://example.test")
    cfg = load_config()
    assert cfg["apiKey"] == "btg_env"
    assert cfg["baseUrl"] == "https://example.test"


def test_load_config_override(monkeypatch):
    monkeypatch.setenv("ZYT_API_KEY", "btg_env")
    cfg = load_config(api_key="btg_cli", base_url="https://cli.test")
    assert cfg["apiKey"] == "btg_cli"
    assert cfg["baseUrl"] == "https://cli.test"


def test_default_base(monkeypatch):
    monkeypatch.delenv("ZYT_BASE_URL", raising=False)
    cfg = load_config()
    assert cfg["baseUrl"] == DEFAULT_BASE_URL


def test_save_config(tmp_path, monkeypatch):
    monkeypatch.setenv("HOME", str(tmp_path))
    # 不在本仓库 cwd 内写家目录：prefer_home
    out = save_config(api_key="btg_x", base_url="https://saved.test", prefer_home=True)
    raw = json.loads((tmp_path / ".config" / "zyt" / "config.json").read_text())
    assert raw["apiKey"] == "btg_x"
    assert raw["baseUrl"] == "https://saved.test"
    assert out["_path"].endswith("config.json")


def test_project_config(tmp_path, monkeypatch):
    monkeypatch.delenv("ZYT_API_KEY", raising=False)
    monkeypatch.delenv("ZYT_BASE_URL", raising=False)
    (tmp_path / "docs").mkdir()
    (tmp_path / "docs" / "command-contract.md").write_text("# stub\n")
    save_config(api_key="btg_proj", base_url="https://proj.test", cwd=tmp_path)
    cfg = load_config(cwd=tmp_path)
    assert cfg["apiKey"] == "btg_proj"
    assert cfg["baseUrl"] == "https://proj.test"
    assert (tmp_path / ".zyt" / "config.json").exists()


def test_plan_me():
    assert build_request_plan(["身份"]) == {
        "command": "身份",
        "method": "GET",
        "path": "/openapi/v1/me",
        "query": {},
        "body": None,
    }


def test_plan_series_cn():
    assert build_request_plan(
        ["指标时序", "--城市", "北京", "--指标", "SH_PRICE", "--期数", "6"]
    ) == {
        "command": "指标时序",
        "method": "GET",
        "path": "/openapi/v1/indicators/series",
        "query": {"city": "北京", "code": "SH_PRICE", "limit": "6"},
        "body": None,
    }


def test_plan_batch():
    q = json.dumps([{"code": "SH_PRICE"}], ensure_ascii=False)
    assert build_request_plan(["批量时序", "--city", "北京", "--queries", q]) == {
        "command": "批量时序",
        "method": "POST",
        "path": "/openapi/v1/indicators/batch-series",
        "query": {},
        "body": {"city": "北京", "queries": [{"code": "SH_PRICE"}]},
    }


def test_plan_brief_cn():
    plan = build_request_plan(
        ["解读", "--城市", "北京", "--议题", "见底了吗", "--行业", "房地产", "--期数", "6"]
    )
    assert plan["command"] == "解读"
    assert plan["local"] is True
    assert plan["city"] == "北京"
    assert plan["topic"] == "见底了吗"
    assert plan["industry"] == "房地产"
    assert plan["limit"] == "6"


def test_plan_brief_en_alias():
    plan = build_request_plan(
        ["experts", "brief", "--city", "上海", "--topic", "how is the market"]
    )
    assert plan["command"] == "解读"
    assert plan["city"] == "上海"
    assert plan["topic"] == "how is the market"


def test_plan_brief_synonyms():
    for cmd in ("分析", "研判", "点评", "诊断"):
        plan = build_request_plan([cmd, "--城市", "北京", "--议题", "见底了吗"])
        assert plan["command"] == "解读", cmd
        assert plan["city"] == "北京"
        assert plan["topic"] == "见底了吗"
    for sub in ("analyze", "analysis", "outlook", "interpret", "研判"):
        plan = build_request_plan(["experts", sub, "--city", "北京", "--topic", "x"])
        assert plan["command"] == "解读", sub


def test_plan_experts_match_still_works():
    plan = build_request_plan(["专家匹配", "--议题", "测试", "--行业", "房地产"])
    assert plan["command"] == "专家匹配"
    assert plan["topic"] == "测试"


def test_plan_update():
    assert build_request_plan(["更新"]) == {"command": "更新", "local": True, "action": "check"}
    assert build_request_plan(["update"]) == {"command": "更新", "local": True, "action": "check"}
