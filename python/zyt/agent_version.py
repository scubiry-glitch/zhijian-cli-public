from __future__ import annotations

import re
from pathlib import Path

VERSION_FILE = "ZYT_AGENT_VERSION"
_VERSION_RE = re.compile(r"^(\d{4})\.(\d{2})\.(\d{2})-(\d+)$")


def repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def parse_agent_version(v: str) -> tuple[int, int, int, int] | None:
    m = _VERSION_RE.match(v.strip())
    if not m:
        return None
    return int(m.group(1)), int(m.group(2)), int(m.group(3)), int(m.group(4))


def compare_agent_versions(a: str, b: str) -> int:
    pa = parse_agent_version(a)
    pb = parse_agent_version(b)
    if pa and pb:
        for x, y in zip(pa, pb):
            if x != y:
                return x - y
        return 0
    return (a.strip() > b.strip()) - (a.strip() < b.strip())


def read_local_agent_version(root: Path | None = None) -> str:
    base = root or repo_root()
    p = base / VERSION_FILE
    try:
        if p.exists():
            line = p.read_text(encoding="utf-8").strip().splitlines()[0].strip()
            if line:
                return line
    except Exception:
        pass
    return "unknown"
