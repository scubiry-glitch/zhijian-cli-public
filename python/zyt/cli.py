from __future__ import annotations

import sys
from pathlib import Path

from .client import ZytClient
from .config import DEFAULT_BASE_URL, load_config, save_config
from .errors import ApiError
from .experts.brief import run_brief
from .experts.render import render_brief_markdown, write_chart_file
from .experts.service import run_expert_match
from .format import emit_error, emit_success
from .request_plan import build_request_plan, parse_opts, split_argv
from .telemetry import report_prompt
from .update import check_update, format_update_message


HELP = """zyt — 贝壳智见开放 API CLI

用法:
  zyt [--json] [--insecure|-k] [--base-url URL] [--api-key KEY] <命令> [选项]

中文命令:
  身份
  指标目录
  指标时序 / 批量时序 / 多城对比
  地理数据包 / 地理时序 / 地理树 / 地理搜索
  行政区分布 / 市场快照
  报告列表 / 报告详情 <id>
  政策列表
  城市专报 城市级|面积|城区|总价 --城市 <名> --年月 YYYYMM [--城区 <名>（仅城区子命令）]
  中指 土地统计|新房统计|新房项目|二手统计 --城市 <名> --年月 YYYYMM
  中指 土地明细 --城市 <名>                       （该表无年月，仅按城市）
  配置 查看 / 配置 设置
  更新          检查 GitHub release 分支是否有新版本
  解读|分析|研判|点评|诊断
                --城市 <名> --议题 <文本> [--行业] [--重要度] [--任务] [--指标] [--期数] [--专家 id]
                [--markdown] [--写图 path.svg]
  专家匹配      --议题 <文本> [--行业] [--重要度] [--任务] [--专家 id]
                [--专家模式 local|remote] [--专家服务 URL]

研判优先：zyt 解读 --markdown（半成品）/ --写图（SVG 落盘）。专家服务默认 remote，需配置 expertsRemoteUrl。Agent 请加 --json。
"""


def extract_global(argv: list[str]) -> tuple[bool, bool, str | None, str | None, list[str]]:
    rest: list[str] = []
    as_json = False
    insecure = False
    api_key = None
    base_url = None
    i = 0
    while i < len(argv):
        a = argv[i]
        if a == "--json":
            as_json = True
            i += 1
            continue
        if a in ("--insecure", "-k"):
            insecure = True
            i += 1
            continue
        if a == "--api-key":
            api_key = argv[i + 1] if i + 1 < len(argv) else None
            i += 2
            continue
        if a.startswith("--api-key="):
            api_key = a.split("=", 1)[1]
            i += 1
            continue
        if a == "--base-url":
            base_url = argv[i + 1] if i + 1 < len(argv) else None
            i += 2
            continue
        if a.startswith("--base-url="):
            base_url = a.split("=", 1)[1]
            i += 1
            continue
        rest.append(a)
        i += 1
    return as_json, insecure, api_key, base_url, rest


def expand_queries_file(argv: list[str]) -> list[str]:
    out: list[str] = []
    i = 0
    while i < len(argv):
        a = argv[i]
        if a in ("--queries-file", "--查询文件"):
            if i + 1 >= len(argv):
                raise ApiError("MISSING_PARAM", "缺少 --queries-file 路径", exit_code=1)
            content = Path(argv[i + 1]).read_text(encoding="utf-8").strip()
            out.extend(["--queries", content])
            i += 2
            continue
        if a.startswith("--queries-file=") or a.startswith("--查询文件="):
            file = a.split("=", 1)[1]
            content = Path(file).read_text(encoding="utf-8").strip()
            out.extend(["--queries", content])
            i += 1
            continue
        out.append(a)
        i += 1
    return out


def main(argv: list[str] | None = None) -> int:
    argv = list(sys.argv[1:] if argv is None else argv)
    if not argv or argv[0] in ("-h", "--help"):
        sys.stdout.write(HELP)
        return 0

    as_json, insecure_flag, api_key, base_url, rest = extract_global(argv)
    try:
        rest = expand_queries_file(rest)
    except Exception as e:  # noqa: BLE001
        return emit_error(e, as_json)

    if "-h" in rest or "--help" in rest:
        sys.stdout.write(HELP)
        return 0

    try:
        plan = build_request_plan(rest)
    except Exception as e:  # noqa: BLE001
        return emit_error(ApiError("INVALID_PARAM", str(e), exit_code=1), as_json)

    if plan.get("local"):
        if plan.get("command") == "更新":
            try:
                result = check_update()
                if as_json:
                    emit_success(result, True)
                else:
                    import sys

                    sys.stdout.write(format_update_message(result))
                return 0
            except Exception as e:  # noqa: BLE001
                return emit_error(e, as_json)

        if plan.get("command") == "解读":
            city = plan.get("city") or ""
            topic = plan.get("topic") or ""
            if not city:
                return emit_error(
                    ApiError("MISSING_PARAM", "解读需要 --城市/--city", exit_code=1),
                    as_json,
                )
            if not topic:
                return emit_error(
                    ApiError("MISSING_PARAM", "解读需要 --议题/--topic", exit_code=1),
                    as_json,
                )
            try:
                importance = float(plan.get("importance") or 0.9)
            except (TypeError, ValueError):
                importance = 0.9
            try:
                limit = int(plan.get("limit") or 12)
            except (TypeError, ValueError):
                limit = 12
            raw_codes = plan.get("code") or ""
            codes = [x.strip() for x in str(raw_codes).replace("，", ",").split(",") if x.strip()] or None
            raw_ids = plan.get("expertId") or ""
            expert_ids = [x.strip() for x in str(raw_ids).replace("，", ",").split(",") if x.strip()] or None
            cfg = load_config(
                api_key=api_key,
                base_url=base_url,
                insecure=True if insecure_flag else None,
                experts_mode=plan.get("expertsMode"),
                experts_remote_url=plan.get("expertsRemoteUrl"),
            )
            client = ZytClient(
                base_url=str(cfg.get("baseUrl") or DEFAULT_BASE_URL),
                api_key=cfg.get("apiKey"),
                insecure=bool(cfg.get("insecure")),
            )
            report_prompt(
                topic,
                command="解读",
                api_key=cfg.get("apiKey"),
                base_url=str(cfg.get("baseUrl") or DEFAULT_BASE_URL),
            )

            def _fetch(method: str, path: str, query=None, body=None):
                if method.upper() == "POST":
                    return client.post(path, body)
                return client.get(path, query)

            try:
                result = run_brief(
                    city=city,
                    topic=topic,
                    industry=plan.get("industry") or "房地产",
                    importance=importance,
                    task=plan.get("task") or "analysis",
                    codes=codes,
                    limit=limit,
                    expert_ids=expert_ids,
                    experts_mode=str(cfg.get("expertsMode") or "remote"),
                    experts_remote_url=cfg.get("expertsRemoteUrl") or "",
                    fetch=_fetch,
                )
                chart_out = plan.get("chartOut")
                if chart_out:
                    write_chart_file(result, str(chart_out))
                if plan.get("markdown"):
                    md = render_brief_markdown(result)
                    if as_json:
                        result = {**result, "markdown": md}
                        emit_success(result, True)
                    else:
                        import sys

                        sys.stdout.write(md if md.endswith("\n") else md + "\n")
                    return 0
                emit_success(result, as_json)
                return 0
            except Exception as e:  # noqa: BLE001
                return emit_error(e, as_json)

        if plan.get("command") == "专家匹配":
            topic = plan.get("topic") or ""
            if not topic:
                return emit_error(
                    ApiError("MISSING_PARAM", "专家匹配需要 --议题/--topic", exit_code=1),
                    as_json,
                )
            try:
                importance = float(plan.get("importance") or 0.5)
            except (TypeError, ValueError):
                importance = 0.5
            raw_ids = plan.get("expertId") or ""
            expert_ids = [x.strip() for x in str(raw_ids).replace("，", ",").split(",") if x.strip()] or None
            cfg = load_config(
                api_key=api_key,
                base_url=base_url,
                insecure=True if insecure_flag else None,
                experts_mode=plan.get("expertsMode"),
                experts_remote_url=plan.get("expertsRemoteUrl"),
            )
            report_prompt(
                topic,
                command="专家匹配",
                api_key=cfg.get("apiKey"),
                base_url=str(cfg.get("baseUrl") or DEFAULT_BASE_URL),
            )
            try:
                result = run_expert_match(
                    topic=topic,
                    industry=plan.get("industry"),
                    importance=importance,
                    task=plan.get("task") or "analysis",
                    expert_ids=expert_ids,
                    mode=str(cfg.get("expertsMode") or "remote"),
                    remote_url=cfg.get("expertsRemoteUrl") or "",
                )
                emit_success(result, as_json)
                return 0
            except Exception as e:  # noqa: BLE001
                return emit_error(e, as_json)

        cfg = load_config(
            api_key=api_key,
            base_url=base_url,
            insecure=True if insecure_flag else None,
        )
        if plan.get("action") == "set":
            _, opt_args = split_argv(rest)
            opts = parse_opts(opt_args)
            existing = load_config()
            next_cfg = save_config(
                api_key=opts.get("apiKey") or api_key or existing.get("apiKey"),
                base_url=opts.get("baseUrl")
                or base_url
                or existing.get("baseUrl")
                or DEFAULT_BASE_URL,
                experts_mode=opts.get("expertsMode"),
                experts_remote_url=opts.get("expertsRemoteUrl")
                if "expertsRemoteUrl" in opts
                else None,
            )
            emit_success(
                {
                    "ok": True,
                    "path": next_cfg.get("_path"),
                    "baseUrl": next_cfg.get("baseUrl"),
                    "apiKeySet": bool(next_cfg.get("apiKey")),
                    "expertsMode": next_cfg.get("expertsMode"),
                    "expertsRemoteUrl": next_cfg.get("expertsRemoteUrl", ""),
                },
                as_json,
            )
            return 0
        emit_success(
            {
                "baseUrl": cfg["baseUrl"],
                "apiKeySet": bool(cfg.get("apiKey")),
                "apiKeyPreview": (cfg["apiKey"][:4] + "…") if cfg.get("apiKey") else None,
                "insecure": bool(cfg.get("insecure")),
                "expertsMode": cfg.get("expertsMode") or "remote",
                "expertsRemoteUrl": cfg.get("expertsRemoteUrl") or "",
            },
            as_json,
        )
        return 0

    cfg = load_config(
        api_key=api_key,
        base_url=base_url,
        insecure=True if insecure_flag else None,
    )
    client = ZytClient(
        base_url=cfg["baseUrl"],
        api_key=cfg.get("apiKey"),
        insecure=bool(cfg.get("insecure")),
    )
    try:
        if plan.get("method") == "POST":
            data = client.post(plan["path"], plan.get("body"))
        else:
            data = client.get(plan["path"], plan.get("query"))
        emit_success(data, as_json)
        return 0
    except Exception as e:  # noqa: BLE001
        return emit_error(e, as_json)


if __name__ == "__main__":
    raise SystemExit(main())
