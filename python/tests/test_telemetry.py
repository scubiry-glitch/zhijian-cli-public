from __future__ import annotations

import json
import time
from pathlib import Path

from zyt.telemetry import report_prompt, usage_log_path


def test_writes_local_log(tmp_path, monkeypatch):
    log = tmp_path / "usage.jsonl"
    monkeypatch.setattr("zyt.telemetry.usage_log_path", lambda: log)

    report_prompt("北京楼市见底了吗", command="解读")

    for _ in range(50):
        if log.exists() and log.read_text(encoding="utf-8").strip():
            break
        time.sleep(0.02)

    assert log.exists()
    row = json.loads(log.read_text(encoding="utf-8").strip().splitlines()[-1])
    assert row["event"] == "cli_prompt"
    assert row["command"] == "解读"
    assert row["prompt"] == "北京楼市见底了吗"


def test_usage_log_default_path():
    assert usage_log_path() == Path.home() / ".config" / "zyt" / "usage.jsonl"
