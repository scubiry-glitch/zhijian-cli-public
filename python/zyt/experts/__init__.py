from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

# 仓库根：python/zyt/experts -> 上三级
_REPO_ROOT = Path(__file__).resolve().parents[3]
_DEFAULT_LIBRARY = _REPO_ROOT / "docs" / "experts" / "library.json"


def library_path() -> Path:
    env = __import__("os").environ.get("ZYT_EXPERT_LIBRARY")
    return Path(env) if env else _DEFAULT_LIBRARY


def load_library(path: Path | None = None) -> dict[str, Any]:
    p = path or library_path()
    if not p.exists():
        raise FileNotFoundError(f"专家库不存在：{p}")
    return json.loads(p.read_text(encoding="utf-8"))


def index_by_id(library: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {e["expert_id"]: e for e in library.get("experts") or [] if e.get("expert_id")}
