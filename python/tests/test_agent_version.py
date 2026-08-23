from __future__ import annotations

from zyt.agent_version import compare_agent_versions, parse_agent_version


def test_parse_agent_version():
    assert parse_agent_version("2026.08.12-2") == (2026, 8, 12, 2)
    assert parse_agent_version("bad") is None


def test_compare_agent_versions():
    assert compare_agent_versions("2026.08.12-2", "2026.08.12-1") > 0
    assert compare_agent_versions("2026.08.13-1", "2026.08.12-9") > 0
    assert compare_agent_versions("2026.08.12-2", "2026.08.12-2") == 0
