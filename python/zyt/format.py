from __future__ import annotations

import json
import sys
from typing import Any

from .errors import ApiError


def emit_success(data: Any, as_json: bool) -> None:
    if as_json:
        sys.stdout.write(json.dumps(data, ensure_ascii=False, indent=2) + "\n")
        return
    sys.stdout.write(_format_human(data) + "\n")


def emit_error(err: BaseException, as_json: bool) -> int:
    if isinstance(err, ApiError):
        api_err = err
    else:
        api_err = ApiError("INTERNAL_ERROR", str(err), exit_code=1)

    if as_json:
        payload: dict[str, Any] = {
            "error": {"code": api_err.code, "message": api_err.message},
        }
        if api_err.http_status is not None:
            payload["error"]["httpStatus"] = api_err.http_status
        sys.stdout.write(json.dumps(payload, ensure_ascii=False, indent=2) + "\n")
    else:
        sys.stderr.write(f"错误 [{api_err.code}]: {api_err.message}\n")
    return api_err.exit_code


def _format_human(data: Any) -> str:
    if data is None:
        return ""
    if not isinstance(data, (dict, list)):
        return str(data)
    if isinstance(data, list):
        return _format_table(data)
    obj = data
    if isinstance(obj.get("rows"), list):
        head = "\n".join(f"{k}: {_fmt(v)}" for k, v in obj.items() if k != "rows")
        body = _format_table(obj["rows"])
        return "\n\n".join(x for x in (head, body) if x)
    if isinstance(obj.get("indicators"), list):
        return _format_table(obj["indicators"])
    if isinstance(obj.get("series"), list):
        head = "\n".join(f"{k}: {_fmt(v)}" for k, v in obj.items() if k != "series")
        body = _format_table(obj["series"])
        return "\n\n".join(x for x in (head, body) if x)
    lines = []
    for k, v in obj.items():
        if isinstance(v, (dict, list)):
            lines.append(f"{k}:\n" + _indent(_format_human(v)))
        else:
            lines.append(f"{k}: {_fmt(v)}")
    return "\n".join(lines)


def _format_table(rows: list[Any]) -> str:
    if not rows:
        return "(空)"
    if not all(isinstance(r, dict) for r in rows):
        return "\n".join(f"- {_fmt(r)}" for r in rows)
    keys: list[str] = []
    seen = set()
    for r in rows:
        for k in r:
            if k not in seen:
                seen.add(k)
                keys.append(k)
    widths = [max(len(k), *(len(str(r.get(k, ""))) for r in rows)) for k in keys]

    def line(cols: list[str]) -> str:
        return "  ".join(c.ljust(widths[i]) for i, c in enumerate(cols))

    header = line(keys)
    sep = "  ".join("-" * w for w in widths)
    body = [line([str(r.get(k, "")) for k in keys]) for r in rows]
    return "\n".join([header, sep, *body])


def _fmt(v: Any) -> str:
    if v is None:
        return ""
    if isinstance(v, (dict, list)):
        return json.dumps(v, ensure_ascii=False)
    return str(v)


def _indent(s: str) -> str:
    return "\n".join("  " + line for line in s.splitlines())
