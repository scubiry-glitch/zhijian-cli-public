from __future__ import annotations

import os
from pathlib import Path

import pytest

_FIXTURE = Path(__file__).resolve().parents[2] / "tests" / "fixtures" / "expert-library.json"


@pytest.fixture(autouse=True)
def _expert_library_fixture(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ZYT_EXPERT_LIBRARY", str(_FIXTURE))
