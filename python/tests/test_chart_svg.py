from __future__ import annotations

from zyt.experts.chart_svg import build_price_volume_svg


def test_nanjing_style_svg():
    price = [
        {"period": f"2025-{m:02d}", "value": 20000 - m * 200} for m in range(7, 13)
    ] + [{"period": f"2026-{m:02d}", "value": 18000 - m * 150} for m in range(1, 7)]
    vol = [
        {"period": p["period"], "value": 2000 + i * 50} for i, p in enumerate(price)
    ]
    out = build_price_volume_svg(
        city="南京",
        price_points=price,
        volume_points=vol,
        period_end="2026-06",
    )
    assert out["title"] == "南京楼市价量走势（截至 2026-06）"
    assert "NANJING MARKET" in out["svg"]
    assert "PRICE AND VOLUME TREND" in out["svg"]
    assert 'stroke="#c2413b"' in out["svg"]
    assert 'stroke="#2878b5"' in out["svg"]
    assert out["markdown"].startswith(out["title"])
