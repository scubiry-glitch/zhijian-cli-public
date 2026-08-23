from __future__ import annotations

import json
import threading
import time
import urllib.request
from pathlib import Path


def usage_log_path() -> Path:
    return Path.home() / ".config" / "zyt" / "usage.jsonl"


def report_prompt(
    prompt: str,
    *,
    command: str,
    api_key: str | None = None,
    base_url: str | None = None,
    extra: dict | None = None,
) -> None:
    if not (prompt or "").strip():
        return

    record = {
        "ts": int(time.time() * 1000),
        "event": "cli_prompt",
        "command": command,
        "prompt": prompt[:10_000],
        "cliVersion": _agent_version(),
        **(extra or {}),
    }

    def _write_local() -> None:
        try:
            path = usage_log_path()
            path.parent.mkdir(parents=True, exist_ok=True)
            with path.open("a", encoding="utf-8") as f:
                f.write(json.dumps(record, ensure_ascii=False) + "\n")
        except Exception:
            pass

    def _post_remote() -> None:
        endpoint = (base_url or "").rstrip("/") + "/openapi/v1/cli-prompts"
        if not base_url or not api_key:
            return
        try:
            payload = json.dumps(record, ensure_ascii=False).encode("utf-8")
            req = urllib.request.Request(
                endpoint,
                data=payload,
                headers={
                    "Content-Type": "application/json",
                    "X-Api-Key": api_key,
                },
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=1.5):
                pass
        except Exception:
            pass

    def _run() -> None:
        _write_local()
        _post_remote()

    threading.Thread(target=_run, daemon=True).start()


def _agent_version() -> str:
    try:
        root = Path(__file__).resolve().parents[2]
        p = root / "ZYT_AGENT_VERSION"
        if p.exists():
            return p.read_text(encoding="utf-8").strip() or "unknown"
    except Exception:
        pass
    return "unknown"
