from __future__ import annotations

import base64
import json
import os
import urllib.error
import urllib.request
from typing import Any
from urllib.parse import quote

from .agent_version import VERSION_FILE, compare_agent_versions, parse_agent_version, read_local_agent_version
from .client import DEFAULT_USER_AGENT
from .errors import ApiError

DEFAULT_RELEASE_REPO = "scubiry-glitch/zhijian-cli-public"
DEFAULT_RELEASE_BRANCH = "release"


def _github_token() -> str | None:
    return os.environ.get("ZYT_GITHUB_TOKEN") or os.environ.get("GITHUB_TOKEN")


def _private_repo_hint() -> str:
    if _github_token():
        return ""
    return " 仓库不存在或无权访问，若使用私有 fork 请设置 ZYT_GITHUB_TOKEN（或 GITHUB_TOKEN，需 repo 读权限）后重试。"


def _github_headers() -> dict[str, str]:
    headers = {
        "Accept": "application/vnd.github+json",
        "User-Agent": DEFAULT_USER_AGENT,
    }
    token = _github_token()
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return headers


def _version_from_branch_name(branch: str) -> str | None:
    if not branch.startswith("release/"):
        return None
    v = branch[len("release/") :].strip()
    return v if parse_agent_version(v) else None


def _branch_url(repo: str, branch: str) -> str:
    return f"https://github.com/{repo}/tree/{branch}"


def _fetch_text(url: str, headers: dict[str, str]) -> str | None:
    req = urllib.request.Request(url, headers=headers, method="GET")
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            text = resp.read().decode("utf-8", errors="replace").strip()
            line = text.splitlines()[0].strip() if text else ""
            return line or None
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return None
        body = e.read().decode("utf-8", errors="replace")[:200]
        raise ApiError("RELEASE_CHECK_FAILED", f"检查发行版失败 HTTP {e.code}: {body}", exit_code=3) from e
    except urllib.error.URLError as e:
        raise ApiError("NETWORK_ERROR", str(e.reason), exit_code=3) from e


def _fetch_version_from_branch(repo: str, branch: str) -> str | None:
    raw_url = f"https://raw.githubusercontent.com/{repo}/{quote(branch)}/{VERSION_FILE}"
    raw = _fetch_text(raw_url, {"User-Agent": DEFAULT_USER_AGENT})
    if raw:
        return raw

    api_url = f"https://api.github.com/repos/{repo}/contents/{VERSION_FILE}?ref={quote(branch)}"
    req = urllib.request.Request(api_url, headers=_github_headers(), method="GET")
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            body = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return None
        msg = e.read().decode("utf-8", errors="replace")[:200]
        raise ApiError("RELEASE_CHECK_FAILED", f"GitHub API 失败 HTTP {e.code}: {msg}", exit_code=3) from e
    except urllib.error.URLError as e:
        raise ApiError("NETWORK_ERROR", str(e.reason), exit_code=3) from e

    content = body.get("content")
    if not content:
        return None
    decoded = base64.b64decode(content.replace("\n", "")).decode("utf-8").strip()
    return decoded.splitlines()[0].strip() if decoded else None


def _list_release_branches(repo: str) -> list[str]:
    url = f"https://api.github.com/repos/{repo}/branches?per_page=100"
    req = urllib.request.Request(url, headers=_github_headers(), method="GET")
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            branches = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        if e.code == 404:
            raise ApiError(
                "RELEASE_CHECK_FAILED",
                f"仓库不存在或无权访问：{repo}。{_private_repo_hint()}",
                exit_code=3,
            ) from e
        msg = e.read().decode("utf-8", errors="replace")[:200]
        raise ApiError("RELEASE_CHECK_FAILED", f"列举分支失败 HTTP {e.code}: {msg}", exit_code=3) from e
    except urllib.error.URLError as e:
        raise ApiError("NETWORK_ERROR", str(e.reason), exit_code=3) from e

    return [
        b["name"]
        for b in branches
        if isinstance(b, dict) and (b.get("name") == "release" or str(b.get("name", "")).startswith("release/"))
    ]


def _resolve_latest_release(repo: str, preferred_branch: str) -> dict[str, str]:
    preferred_version = _fetch_version_from_branch(repo, preferred_branch)
    if preferred_version:
        return {"branch": preferred_branch, "version": preferred_version}

    best: dict[str, str] | None = None
    for branch in _list_release_branches(repo):
        version = _version_from_branch_name(branch)
        if not version:
            version = _fetch_version_from_branch(repo, branch)
        else:
            file_version = _fetch_version_from_branch(repo, branch)
            if file_version:
                version = file_version
        if not version or not parse_agent_version(version):
            continue
        if not best or compare_agent_versions(version, best["version"]) > 0:
            best = {"branch": branch, "version": version}

    if not best:
        raise ApiError(
            "RELEASE_CHECK_FAILED",
            f"未找到可用发行版分支（尝试 {preferred_branch} 与 release/*）。{_private_repo_hint()}",
            exit_code=3,
        )
    return best


def check_update(
    *,
    repo: str | None = None,
    branch: str | None = None,
    local_version: str | None = None,
) -> dict[str, Any]:
    repo_name = (repo or os.environ.get("ZYT_RELEASE_REPO") or DEFAULT_RELEASE_REPO).strip()
    branch_name = (branch or os.environ.get("ZYT_RELEASE_BRANCH") or DEFAULT_RELEASE_BRANCH).strip()
    local = local_version or read_local_agent_version()
    latest = _resolve_latest_release(repo_name, branch_name)
    update_available = compare_agent_versions(latest["version"], local) > 0
    return {
        "command": "更新",
        "repo": repo_name,
        "localVersion": local,
        "remoteVersion": latest["version"],
        "remoteBranch": latest["branch"],
        "updateAvailable": update_available,
        "upToDate": not update_available,
        "url": _branch_url(repo_name, latest["branch"]),
    }


def format_update_message(result: dict[str, Any]) -> str:
    lines = [
        f"当前版本：{result['localVersion']}",
        f"远程最新：{result['remoteVersion']}（分支 {result['remoteBranch']}）",
    ]
    if result.get("updateAvailable"):
        lines.append(f"有可用更新：{result['url']}")
    else:
        lines.append("已是最新版本。")
    return "\n".join(lines) + "\n"
