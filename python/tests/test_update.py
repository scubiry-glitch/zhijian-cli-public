from __future__ import annotations

import io
import json
from unittest.mock import patch

from zyt.update import check_update, format_update_message


class _FakeResp:
    def __init__(self, body: bytes, *, status: int = 200):
        self._body = body
        self.status = status

    def read(self) -> bytes:
        return self._body

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False


def test_check_update_available():
    def fake_urlopen(req, timeout=15):  # noqa: ARG001
        url = req.full_url
        if "raw.githubusercontent.com" in url:
            return _FakeResp(b"2026.08.13-1\n")
        raise AssertionError(f"unexpected url: {url}")

    with patch("zyt.update.urllib.request.urlopen", fake_urlopen):
        result = check_update(
            repo="scubiry-glitch/zhijian-cli-public",
            branch="release",
            local_version="2026.08.12-2",
        )

    assert result["updateAvailable"] is True
    assert result["remoteVersion"] == "2026.08.13-1"
    assert result["remoteBranch"] == "release"
    assert "有可用更新" in format_update_message(result)


def test_check_update_up_to_date():
    def fake_urlopen(req, timeout=15):  # noqa: ARG001
        return _FakeResp(b"2026.08.12-2\n")

    with patch("zyt.update.urllib.request.urlopen", fake_urlopen):
        result = check_update(branch="release", local_version="2026.08.12-2")

    assert result["upToDate"] is True
    assert "已是最新版本" in format_update_message(result)


def test_check_update_private_repo_hint():
    import os
    import urllib.error

    import pytest
    from zyt.errors import ApiError

    def fake_urlopen(req, timeout=15):  # noqa: ARG001
        raise urllib.error.HTTPError(req.full_url, 404, "Not Found", hdrs=None, fp=io.BytesIO(b"Not Found"))

    prev = os.environ.pop("ZYT_GITHUB_TOKEN", None)
    prev2 = os.environ.pop("GITHUB_TOKEN", None)
    try:
        with patch("zyt.update.urllib.request.urlopen", fake_urlopen):
            with pytest.raises(ApiError) as exc:
                check_update(branch="release", local_version="2026.08.12-2")
        assert "ZYT_GITHUB_TOKEN" in str(exc.value.message)
    finally:
        if prev is not None:
            os.environ["ZYT_GITHUB_TOKEN"] = prev
        if prev2 is not None:
            os.environ["GITHUB_TOKEN"] = prev2
