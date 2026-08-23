from __future__ import annotations

import json
import urllib.error
import urllib.request
from typing import Any

from ..errors import ApiError
from .match import match_experts


def run_expert_match(
    *,
    topic: str,
    industry: str | None = None,
    importance: float = 0.5,
    task: str = "analysis",
    expert_ids: list[str] | None = None,
    mode: str = "local",
    remote_url: str | None = None,
) -> dict[str, Any]:
    """按配置走本地库或远程专家服务。"""
    m = (mode or "local").strip().lower()
    if m not in ("local", "remote"):
        raise ApiError("INVALID_PARAM", f"expertsMode 仅支持 local|remote，收到：{mode}", exit_code=1)

    if m == "local":
        result = match_experts(
            topic=topic,
            industry=industry,
            importance=importance,
            task=task,
            expert_ids=expert_ids,
        )
        result["service"] = {"mode": "local"}
        return result

    url = (remote_url or "").strip()
    if not url:
        raise ApiError(
            "EXPERTS_REMOTE_UNCONFIGURED",
            "专家服务模式为 remote，但 expertsRemoteUrl 为空（待更新）。请改用 local，或配置 ZYT_EXPERTS_REMOTE_URL / .zyt/config.json",
            exit_code=1,
        )

    payload = {
        "topic": topic,
        "industry": industry,
        "importance": importance,
        "task": task,
        "expertIds": expert_ids or [],
    }
    data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        headers={
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": (
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
            ),
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            text = resp.read().decode("utf-8")
            status = resp.status
    except urllib.error.HTTPError as e:
        text = e.read().decode("utf-8", errors="replace")
        raise ApiError(
            "EXPERTS_REMOTE_ERROR",
            f"远程专家服务 HTTP {e.code}: {text[:300]}",
            http_status=e.code,
            exit_code=3,
        ) from e
    except urllib.error.URLError as e:
        raise ApiError("NETWORK_ERROR", f"远程专家服务不可达：{e.reason}", exit_code=3) from e

    try:
        body: Any = json.loads(text) if text else {}
    except json.JSONDecodeError as e:
        raise ApiError("EXPERTS_REMOTE_ERROR", f"远程专家服务返回非 JSON：{text[:200]}", exit_code=3) from e

    if not isinstance(body, dict):
        body = {"data": body}
    body.setdefault("service", {"mode": "remote", "url": url, "httpStatus": status})
    return body
