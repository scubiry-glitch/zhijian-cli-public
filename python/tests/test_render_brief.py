from __future__ import annotations

from zyt.experts.render import render_brief_markdown, write_chart_file
from zyt.request_plan import build_request_plan


def test_plan_brief_markdown_and_chart_out():
    plan = build_request_plan(
        [
            "解读",
            "--城市",
            "南京",
            "--议题",
            "见底了吗",
            "--markdown",
            "--写图",
            "docs/samples/_charts/nanjing.svg",
        ]
    )
    assert plan["command"] == "解读"
    assert plan["markdown"] is True
    assert plan["chartOut"] == "docs/samples/_charts/nanjing.svg"


def test_render_markdown_and_write_chart(tmp_path):
    brief = {
        "zytAgentVersion": "2026.08.12-2",
        "city": "南京",
        "topic": "价量",
        "codes": ["SH_PRICE", "SH_VOL"],
        "data": {
            "dataView": "external",
            "periodEnd": "2026-06",
            "seriesByCode": {
                "SH_PRICE": {
                    "series": [
                        {"period": "2026-05", "value": 20000},
                        {"period": "2026-06", "value": 19800},
                    ]
                },
                "SH_VOL": {
                    "series": [
                        {"period": "2026-05", "value": 100},
                        {"period": "2026-06", "value": 110},
                    ]
                },
            },
        },
        "chartSvg": {
            "title": "南京楼市价量走势（截至 2026-06）",
            "svg": '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
            "markdown": "南京楼市价量走势\n<svg></svg>",
        },
        "analysts": [
            {
                "expert_id": "BK-024",
                "title": "行业研究·数据/研判/解读专家",
                "tag": "【分析员 · BK-024 · 行业研究·数据/研判/解读专家】",
                "frameworks": ["底部信号"],
                "mentalModel": "长期主义",
            }
        ],
        "followupQuestions": [{"question": "q1", "suggestedCommand": "zyt 身份"}],
        "recommendedExperts": [{"tag": "【推荐 · BK-010 · x】"}],
    }
    out = tmp_path / "n.svg"
    write_chart_file(brief, str(out))
    assert out.exists()
    assert brief["chartSvg"]["filePath"] == str(out)
    md = render_brief_markdown(brief)
    assert "数据底稿" in md
    assert "SH_PRICE" in md
    assert "图表文件" in md
    assert str(out) in md
    assert "【分析员 · BK-024" in md
    assert "推荐继续问" in md
