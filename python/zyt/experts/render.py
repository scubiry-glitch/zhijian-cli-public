from __future__ import annotations

from pathlib import Path
from typing import Any


def render_brief_markdown(brief: dict[str, Any]) -> str:
    """解读半成品 Markdown：底稿表 + 图表路径/骨架 + 分析员续写位。"""
    city = brief.get("city") or ""
    topic = brief.get("topic") or ""
    data = brief.get("data") or {}
    data_view = data.get("dataView")
    period_end = data.get("periodEnd")
    series_by_code = data.get("seriesByCode") or {}
    chart_svg = brief.get("chartSvg") or {}
    analysts = brief.get("analysts") or []
    followups = brief.get("followupQuestions") or []
    recommended = brief.get("recommendedExperts") or []

    lines: list[str] = [
        f"# {city} · {topic}",
        "",
        f"- dataView: `{data_view}`",
        f"- periodEnd: `{period_end}`",
        f"- zytAgentVersion: `{brief.get('zytAgentVersion')}`",
        "",
        "## 数据底稿",
        "",
    ]

    codes = [c for c in (brief.get("codes") or list(series_by_code.keys())) if c in series_by_code]
    if not codes:
        codes = list(series_by_code.keys())

    # aligned table by period
    period_map: dict[str, dict[str, Any]] = {}
    for code in codes:
        for row in (series_by_code.get(code) or {}).get("series") or []:
            if not isinstance(row, dict):
                continue
            p = str(row.get("period") or "")
            if not p:
                continue
            period_map.setdefault(p, {})[code] = row.get("display_value") or row.get("value")
    periods = sorted(period_map.keys())
    if periods and codes:
        header = "| period | " + " | ".join(codes) + " |"
        sep = "|--------|" + "|".join(["------"] * len(codes)) + "|"
        lines.extend([header, sep])
        for p in periods:
            cells = [str(period_map[p].get(c, "")) for c in codes]
            lines.append("| " + p + " | " + " | ".join(cells) + " |")
    else:
        lines.append("（无时序数据）")

    lines.extend(["", "## 图表", ""])
    chart_path = chart_svg.get("filePath") or chart_svg.get("path")
    if chart_path:
        lines.append(f"{chart_svg.get('title') or (city + '楼市价量走势')}")
        lines.append(f"图表文件：`{chart_path}`")
        lines.append("（请在浏览器/预览中打开；Codex 勿在终端粘贴 SVG 源码）")
    elif chart_svg.get("markdown"):
        lines.append(str(chart_svg["markdown"]))
    elif chart_svg.get("svg"):
        title = chart_svg.get("title") or f"{city}楼市价量走势"
        lines.append(title)
        lines.append(str(chart_svg["svg"]))
    else:
        lines.append("（无图表；可用 `--写图 path.svg` 落盘）")

    lines.extend(["", "## 分析员解读（请续写，每位约 500 字）", ""])
    if not analysts:
        lines.append("（未匹配到分析员）")
    for a in analysts:
        tag = a.get("tag") or f"【分析员 · {a.get('expert_id')} · {a.get('title')}】"
        lines.append(tag)
        lines.append("")
        lines.append("（在此续写：结论先行；装载 mentalModels/frameworks；按 outputContract 交付）")
        lines.append("")
        frameworks = a.get("frameworks") or []
        if frameworks:
            lines.append(f"- 可用框架：{', '.join(str(x) for x in frameworks[:6])}")
        if a.get("mentalModel"):
            lines.append(f"- 心智摘要：{str(a.get('mentalModel'))[:180]}")
        lines.append("")

    lines.extend(
        [
            "## 对照表",
            "",
            "| 分析员 tag | 核心判断 | 信心 |",
            "|------------|----------|------|",
        ]
    )
    for a in analysts:
        short = f"{a.get('expert_id')} · {a.get('title')}"
        lines.append(f"| {short} | （续写） | （续写） |")

    lines.extend(["", "## 推荐继续问", ""])
    for i, q in enumerate(followups[:3], 1):
        if isinstance(q, dict):
            lines.append(f"{i}. {q.get('question')}")
            if q.get("suggestedCommand"):
                lines.append(f"   - 建议：`{q.get('suggestedCommand')}`")
        else:
            lines.append(f"{i}. {q}")

    lines.extend(["", "## 推荐专家", ""])
    if not recommended:
        lines.append("（无）")
    for r in recommended[:3]:
        lines.append(f"- {r.get('tag') or r.get('expert_id')}")

    lines.append("")
    return "\n".join(lines)


def write_chart_file(brief: dict[str, Any], chart_out: str) -> str:
    """把 chartSvg.svg 写入文件，回填 filePath。返回绝对/规范化路径。"""
    chart_svg = brief.get("chartSvg")
    if not isinstance(chart_svg, dict) or not chart_svg.get("svg"):
        raise ValueError("brief 无 chartSvg.svg，无法写图")
    path = Path(chart_out).expanduser()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(str(chart_svg["svg"]), encoding="utf-8")
    resolved = str(path)
    chart_svg["filePath"] = resolved
    # Codex 友好：markdown 改为标题+路径，避免终端倾倒 SVG
    title = chart_svg.get("title") or "价量走势"
    chart_svg["markdown"] = f"{title}\n图表文件：`{resolved}`\n（请在浏览器/预览中打开）"
    brief["chartSvg"] = chart_svg
    return resolved
