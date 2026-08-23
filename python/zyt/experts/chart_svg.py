from __future__ import annotations

from typing import Any

CITY_ASCII = {
    "北京": "BEIJING",
    "上海": "SHANGHAI",
    "广州": "GUANGZHOU",
    "深圳": "SHENZHEN",
    "南京": "NANJING",
    "杭州": "HANGZHOU",
    "成都": "CHENGDU",
    "重庆": "CHONGQING",
    "武汉": "WUHAN",
    "西安": "XIAN",
    "天津": "TIANJIN",
    "苏州": "SUZHOU",
    "青岛": "QINGDAO",
    "长沙": "CHANGSHA",
    "郑州": "ZHENGZHOU",
    "东莞": "DONGGUAN",
    "佛山": "FOSHAN",
    "合肥": "HEFEI",
    "厦门": "XIAMEN",
    "福州": "FUZHOU",
    "济南": "JINAN",
    "大连": "DALIAN",
    "沈阳": "SHENYANG",
    "昆明": "KUNMING",
    "宁波": "NINGBO",
    "无锡": "WUXI",
}


def city_ascii(city: str) -> str:
    return CITY_ASCII.get(city) or "CITY"


def _num(v: Any) -> float | None:
    if v is None:
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _series_values(points: list[dict[str, Any]]) -> list[tuple[str, float]]:
    out: list[tuple[str, float]] = []
    for p in points or []:
        if not isinstance(p, dict):
            continue
        period = str(p.get("period") or "")
        val = _num(p.get("value"))
        if val is None:
            val = _num(p.get("display_value"))
        if not period or val is None:
            continue
        out.append((period, val))
    return out


def _fmt_axis(v: float) -> str:
    av = abs(v)
    if av >= 1000:
        k = v / 1000.0
        if abs(k - round(k)) < 1e-6:
            return f"{int(round(k))}K"
        return f"{k:.1f}".rstrip("0").rstrip(".") + "K"
    if abs(v - round(v)) < 1e-6:
        return str(int(round(v)))
    return f"{v:.1f}".rstrip("0").rstrip(".")


def _short_period(period: str) -> str:
    # 2025-07 -> 25-07
    if len(period) >= 7 and period[4] == "-":
        return period[2:7]
    return period[-5:] if len(period) >= 5 else period


def _polyline(
    values: list[float],
    *,
    x0: float,
    x1: float,
    y_top: float,
    y_bot: float,
    vmin: float,
    vmax: float,
) -> tuple[str, list[tuple[float, float]]]:
    n = len(values)
    if n == 0:
        return "", []
    span = vmax - vmin if vmax > vmin else 1.0
    coords: list[tuple[float, float]] = []
    for i, v in enumerate(values):
        x = x0 if n == 1 else x0 + (x1 - x0) * i / (n - 1)
        y = y_bot - (v - vmin) / span * (y_bot - y_top)
        coords.append((x, y))
    pts = " ".join(f"{x:.1f},{y:.1f}" for x, y in coords)
    return pts, coords


def build_price_volume_svg(
    *,
    city: str,
    price_points: list[dict[str, Any]],
    volume_points: list[dict[str, Any]],
    period_end: str | None = None,
) -> dict[str, str]:
    """双区折线 SVG（图内 ASCII）；中文标题放 Markdown。"""
    price = _series_values(price_points)
    volume = _series_values(volume_points)
    # align by shared periods when both present
    if price and volume:
        pmap = dict(price)
        vmap = dict(volume)
        periods = [p for p, _ in price if p in vmap]
        if not periods:
            periods = [p for p, _ in price]
        price = [(p, pmap[p]) for p in periods if p in pmap]
        volume = [(p, vmap[p]) for p in periods if p in vmap]
    elif price:
        periods = [p for p, _ in price]
    else:
        periods = [p for p, _ in volume]

    end = period_end or (periods[-1] if periods else "")
    title_md = f"{city}楼市价量走势" + (f"（截至 {end}）" if end else "")
    ascii_city = city_ascii(city)

    x0, x1 = 80.0, 680.0
    # price panel
    py_top, py_bot = 95.0, 215.0
    pvals = [v for _, v in price]
    if pvals:
        pmin, pmax = min(pvals), max(pvals)
        pad = (pmax - pmin) * 0.08 or max(abs(pmax) * 0.02, 1.0)
        pmin, pmax = pmin - pad, pmax + pad
    else:
        pmin, pmax = 0.0, 1.0
    p_pts, p_xy = _polyline(pvals, x0=x0, x1=x1, y_top=py_top, y_bot=py_bot, vmin=pmin, vmax=pmax)

    # volume panel
    vy_top, vy_bot = 275.0, 355.0
    vvals = [v for _, v in volume]
    if vvals:
        vmin, vmax = min(vvals), max(vvals)
        # keep 0 visible when all non-negative
        if vmin >= 0:
            vmin = 0.0
        pad = (vmax - vmin) * 0.08 or max(abs(vmax) * 0.02, 1.0)
        vmax = vmax + pad
    else:
        vmin, vmax = 0.0, 1.0
    v_pts, v_xy = _polyline(vvals, x0=x0, x1=x1, y_top=vy_top, y_bot=vy_bot, vmin=vmin, vmax=vmax)

    def ticks(lo: float, hi: float, y_top: float, y_bot: float, n: int = 4) -> list[tuple[float, str]]:
        out = []
        for i in range(n):
            t = i / (n - 1) if n > 1 else 0
            val = hi - (hi - lo) * t
            y = y_top + (y_bot - y_top) * t
            out.append((y, _fmt_axis(val)))
        return out

    p_ticks = ticks(pmin, pmax, py_top, py_bot)
    v_ticks = ticks(vmin, vmax, vy_top, vy_bot, 3)

    # x labels: first, some middles, last
    xlab: list[tuple[float, str]] = []
    if periods:
        idxs = sorted({0, len(periods) // 5, 2 * len(periods) // 5, 3 * len(periods) // 5, 4 * len(periods) // 5, len(periods) - 1})
        for i in idxs:
            if i < 0 or i >= len(periods):
                continue
            x = x0 if len(periods) == 1 else x0 + (x1 - x0) * i / (len(periods) - 1)
            xlab.append((x, _short_period(periods[i])))

    grid_p = "\n".join(
        f'  <line x1="80" y1="{y:.0f}" x2="680" y2="{y:.0f}" stroke="#dddddd"/>' for y, _ in p_ticks
    )
    labels_p = "\n".join(
        f'  <text x="22" y="{y + 4:.0f}" font-family="Arial, Helvetica, sans-serif" font-size="10" fill="#666666">{lab}</text>'
        for y, lab in p_ticks
    )
    grid_v = "\n".join(
        f'  <line x1="80" y1="{y:.0f}" x2="680" y2="{y:.0f}" stroke="#dddddd"/>' for y, _ in v_ticks
    )
    labels_v = "\n".join(
        f'  <text x="22" y="{y + 4:.0f}" font-family="Arial, Helvetica, sans-serif" font-size="10" fill="#666666">{lab}</text>'
        for y, lab in v_ticks
    )
    circles_p = "\n".join(f'    <circle cx="{x:.1f}" cy="{y:.1f}" r="3"/>' for x, y in p_xy)
    circles_v = "\n".join(f'    <circle cx="{x:.1f}" cy="{y:.1f}" r="3"/>' for x, y in v_xy)
    x_labels = "\n".join(
        f'    <text x="{x:.1f}" y="372">{lab}</text>' for x, lab in xlab
    )

    price_block = ""
    if p_pts:
        price_block = f"""  <text x="48" y="78" font-family="Arial, Helvetica, sans-serif" font-size="12" fill="#333333">PRICE</text>
{grid_p}
{labels_p}
  <polyline points="{p_pts}" fill="none" stroke="#c2413b" stroke-width="3"/>
  <g fill="#c2413b">
{circles_p}
  </g>"""

    vol_block = ""
    if v_pts:
        vol_block = f"""  <text x="48" y="258" font-family="Arial, Helvetica, sans-serif" font-size="12" fill="#333333">VOLUME</text>
{grid_v}
{labels_v}
  <polyline points="{v_pts}" fill="none" stroke="#2878b5" stroke-width="3"/>
  <g fill="#2878b5">
{circles_v}
  </g>"""

    svg = f"""<svg xmlns="http://www.w3.org/2000/svg" width="720" height="380" viewBox="0 0 720 380">
  <rect x="0" y="0" width="720" height="380" fill="#ffffff"/>
  <text x="48" y="28" font-family="Arial, Helvetica, sans-serif" font-size="16" fill="#222222">{ascii_city} MARKET</text>
  <text x="48" y="48" font-family="Arial, Helvetica, sans-serif" font-size="11" fill="#666666">PRICE AND VOLUME TREND</text>
{price_block}
{vol_block}
  <g font-family="Arial, Helvetica, sans-serif" font-size="10" fill="#666666" text-anchor="middle">
{x_labels}
  </g>
</svg>"""

    markdown = f"{title_md}\n{svg}"
    return {"title": title_md, "svg": svg, "markdown": markdown}
