from __future__ import annotations

import json
import ssl
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Callable

from .errors import ApiError, exit_code_for_http

FetchFn = Callable[[urllib.request.Request], Any]

# 贝壳 WAF 会拦截默认 Python-urllib UA
DEFAULT_USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/122.0.0.0 Safari/537.36"
)


def _looks_like_waf_html(text: str) -> bool:
    return "访问已被拦截" in text or "贝壳信息安全中心" in text


class ZytClient:
    def __init__(
        self,
        *,
        base_url: str,
        api_key: str | None = None,
        opener: FetchFn | None = None,
        insecure: bool = False,
        user_agent: str | None = None,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.opener = opener
        self.insecure = insecure
        self.user_agent = user_agent or DEFAULT_USER_AGENT

    def request(
        self,
        method: str,
        path: str,
        *,
        query: dict[str, Any] | None = None,
        body: Any = None,
    ) -> Any:
        if not self.api_key:
            raise ApiError(
                "MISSING_API_KEY",
                "未配置 API Key。请设置 ZYT_API_KEY、写入仓库 `.zyt/config.json`，"
                "或运行：zyt 配置 设置 --api-key <key>（向智见开放 API 管理员申请）",
                exit_code=2,
            )

        q = {k: str(v) for k, v in (query or {}).items() if v is not None and v != ""}
        url = self.base_url + (path if path.startswith("/") else "/" + path)
        if q:
            url = url + "?" + urllib.parse.urlencode(q)

        data = None
        headers = {
            "X-Api-Key": self.api_key,
            "Accept": "application/json",
            "User-Agent": self.user_agent,
        }
        if body is not None:
            data = json.dumps(body, ensure_ascii=False).encode("utf-8")
            headers["Content-Type"] = "application/json"

        req = urllib.request.Request(url, data=data, headers=headers, method=method)
        ctx = ssl._create_unverified_context() if self.insecure else None
        try:
            if self.opener:
                raw = self.opener(req)
                status = getattr(raw, "status", 200)
                text = raw.read().decode("utf-8") if hasattr(raw, "read") else str(raw)
            else:
                with urllib.request.urlopen(req, context=ctx) as resp:
                    status = resp.status
                    text = resp.read().decode("utf-8")
        except urllib.error.HTTPError as e:
            status = e.code
            text = e.read().decode("utf-8", errors="replace")
        except urllib.error.URLError as e:
            raise ApiError("NETWORK_ERROR", str(e.reason), exit_code=3) from e

        payload: Any = None
        if text:
            try:
                payload = json.loads(text)
            except json.JSONDecodeError:
                payload = {"raw": text}

        if status < 200 or status >= 300:
            if status == 403 and _looks_like_waf_html(text):
                raise ApiError(
                    "WAF_BLOCKED",
                    "贝壳 WAF 拦截（HTML「访问已被拦截」）。请确认客户端已带浏览器 User-Agent；"
                    "若仍失败可换网络或联系 API 管理员",
                    http_status=403,
                    exit_code=3,
                )
            code = "HTTP_ERROR"
            message = f"HTTP {status}"
            if isinstance(payload, dict):
                if isinstance(payload.get("code"), str):
                    code = payload["code"]
                err = payload.get("error")
                if isinstance(err, dict):
                    if isinstance(err.get("code"), str):
                        code = err["code"]
                    if isinstance(err.get("message"), str):
                        message = err["message"]
                if isinstance(payload.get("message"), str):
                    message = payload["message"]
            if status == 401 and code == "HTTP_ERROR":
                code = "INVALID_API_KEY"
            raise ApiError(code, message, http_status=status, exit_code=exit_code_for_http(status))

        return payload

    def get(self, path: str, query: dict[str, Any] | None = None) -> Any:
        return self.request("GET", path, query=query)

    def post(self, path: str, body: Any) -> Any:
        return self.request("POST", path, body=body)
