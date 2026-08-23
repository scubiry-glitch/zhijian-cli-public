from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

DEFAULT_BASE_URL = "https://dss.ke.com"
DEFAULT_EXPERTS_MODE = "remote"
# 远程专家服务 URL 占位，待更新
DEFAULT_EXPERTS_REMOTE_URL = ""
PROJECT_CONFIG_REL = Path(".zyt") / "config.json"


def home_config_path() -> Path:
    return Path.home() / ".config" / "zyt" / "config.json"


def config_path() -> Path:
    """兼容旧名：家目录配置。"""
    return home_config_path()


def find_project_root(start: Path | None = None) -> Path | None:
    cur = (start or Path.cwd()).resolve()
    for directory in [cur, *cur.parents]:
        if (
            (directory / ".zyt").exists()
            or (directory / "docs" / "command-contract.md").exists()
            or (directory / "packages" / "ts-cli" / "package.json").exists()
        ):
            return directory
    return None


def project_config_path(cwd: Path | None = None) -> Path | None:
    root = find_project_root(cwd)
    return (root / PROJECT_CONFIG_REL) if root else None


def _read_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return {}


def read_project_config_file(cwd: Path | None = None) -> dict[str, Any]:
    p = project_config_path(cwd)
    return _read_json(p) if p else {}


def read_config_file() -> dict[str, Any]:
    return _read_json(home_config_path())


def _norm_experts_mode(v: Any) -> str | None:
    if not isinstance(v, str):
        return None
    s = v.strip().lower()
    return s if s in ("local", "remote") else None


def save_config(
    *,
    api_key: str | None = None,
    base_url: str | None = None,
    insecure: bool | None = None,
    experts_mode: str | None = None,
    experts_remote_url: str | None = None,
    prefer_home: bool = False,
    cwd: Path | None = None,
) -> dict[str, Any]:
    """写入仓库 `.zyt/config.json`（若在项目内），否则写入 `~/.config/zyt/config.json`。"""
    project = None if prefer_home else project_config_path(cwd)
    target = project or home_config_path()
    current = _read_json(target)
    next_cfg: dict[str, Any] = {
        "baseUrl": base_url or current.get("baseUrl") or DEFAULT_BASE_URL,
    }
    key = api_key if api_key is not None else current.get("apiKey")
    if key:
        next_cfg["apiKey"] = key
    if insecure is not None:
        if insecure:
            next_cfg["insecure"] = True
    elif current.get("insecure"):
        next_cfg["insecure"] = True

    mode = _norm_experts_mode(experts_mode) or _norm_experts_mode(current.get("expertsMode"))
    if mode:
        next_cfg["expertsMode"] = mode
    if experts_remote_url is not None:
        next_cfg["expertsRemoteUrl"] = experts_remote_url
    elif "expertsRemoteUrl" in current:
        next_cfg["expertsRemoteUrl"] = current.get("expertsRemoteUrl")

    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(next_cfg, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    next_cfg["_path"] = str(target)
    return next_cfg


def load_config(
    api_key: str | None = None,
    base_url: str | None = None,
    insecure: bool | None = None,
    experts_mode: str | None = None,
    experts_remote_url: str | None = None,
    cwd: Path | None = None,
) -> dict[str, Any]:
    """优先级：CLI flag > 环境变量 > 仓库 `.zyt/config.json` > 家目录配置。"""
    project = read_project_config_file(cwd)
    home = read_config_file()
    env_insecure = os.environ.get("ZYT_INSECURE", "").lower() in ("1", "true", "yes")
    if insecure is None:
        insecure_val = env_insecure or bool(project.get("insecure")) or bool(home.get("insecure"))
    else:
        insecure_val = insecure

    mode = (
        _norm_experts_mode(experts_mode)
        or _norm_experts_mode(os.environ.get("ZYT_EXPERTS_MODE"))
        or _norm_experts_mode(project.get("expertsMode"))
        or _norm_experts_mode(home.get("expertsMode"))
        or DEFAULT_EXPERTS_MODE
    )
    if experts_remote_url is not None:
        remote = experts_remote_url
    elif os.environ.get("ZYT_EXPERTS_REMOTE_URL") is not None:
        remote = os.environ.get("ZYT_EXPERTS_REMOTE_URL") or ""
    elif "expertsRemoteUrl" in project:
        remote = project.get("expertsRemoteUrl") or ""
    elif "expertsRemoteUrl" in home:
        remote = home.get("expertsRemoteUrl") or ""
    else:
        remote = DEFAULT_EXPERTS_REMOTE_URL

    return {
        "apiKey": api_key or os.environ.get("ZYT_API_KEY") or project.get("apiKey") or home.get("apiKey"),
        "baseUrl": base_url
        or os.environ.get("ZYT_BASE_URL")
        or project.get("baseUrl")
        or home.get("baseUrl")
        or DEFAULT_BASE_URL,
        "insecure": insecure_val,
        "expertsMode": mode,
        "expertsRemoteUrl": remote,
    }
