const CITY_ASCII: Record<string, string> = {
  北京: "BEIJING",
  上海: "SHANGHAI",
  广州: "GUANGZHOU",
  深圳: "SHENZHEN",
  南京: "NANJING",
  杭州: "HANGZHOU",
  成都: "CHENGDU",
  重庆: "CHONGQING",
  武汉: "WUHAN",
  西安: "XIAN",
  天津: "TIANJIN",
  苏州: "SUZHOU",
  青岛: "QINGDAO",
  长沙: "CHANGSHA",
  郑州: "ZHENGZHOU",
  东莞: "DONGGUAN",
  佛山: "FOSHAN",
  合肥: "HEFEI",
  厦门: "XIAMEN",
  福州: "FUZHOU",
  济南: "JINAN",
  大连: "DALIAN",
  沈阳: "SHENYANG",
  昆明: "KUNMING",
  宁波: "NINGBO",
  无锡: "WUXI",
};

type Pt = { period?: string; value?: unknown; display_value?: unknown };

function cityAscii(city: string): string {
  return CITY_ASCII[city] || "CITY";
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function seriesValues(points: Pt[]): Array<[string, number]> {
  const out: Array<[string, number]> = [];
  for (const p of points || []) {
    const period = String(p?.period || "");
    let val = num(p?.value);
    if (val === null) val = num(p?.display_value);
    if (!period || val === null) continue;
    out.push([period, val]);
  }
  return out;
}

function fmtAxis(v: number): string {
  const av = Math.abs(v);
  if (av >= 1000) {
    const k = v / 1000;
    if (Math.abs(k - Math.round(k)) < 1e-6) return `${Math.round(k)}K`;
    return `${Number(k.toFixed(1))}K`;
  }
  if (Math.abs(v - Math.round(v)) < 1e-6) return String(Math.round(v));
  return String(Number(v.toFixed(1)));
}

function shortPeriod(period: string): string {
  if (period.length >= 7 && period[4] === "-") return period.slice(2, 7);
  return period.length >= 5 ? period.slice(-5) : period;
}

function polyline(
  values: number[],
  opts: { x0: number; x1: number; yTop: number; yBot: number; vmin: number; vmax: number },
): { pts: string; xy: Array<[number, number]> } {
  const n = values.length;
  if (!n) return { pts: "", xy: [] };
  const span = opts.vmax > opts.vmin ? opts.vmax - opts.vmin : 1;
  const xy: Array<[number, number]> = [];
  for (let i = 0; i < n; i++) {
    const x = n === 1 ? opts.x0 : opts.x0 + ((opts.x1 - opts.x0) * i) / (n - 1);
    const y = opts.yBot - ((values[i]! - opts.vmin) / span) * (opts.yBot - opts.yTop);
    xy.push([x, y]);
  }
  return { pts: xy.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" "), xy };
}

export function buildPriceVolumeSvg(input: {
  city: string;
  pricePoints: Pt[];
  volumePoints: Pt[];
  periodEnd?: string | null;
}): { title: string; svg: string; markdown: string } {
  let price = seriesValues(input.pricePoints);
  let volume = seriesValues(input.volumePoints);
  let periods: string[] = [];
  if (price.length && volume.length) {
    const pmap = new Map(price);
    const vmap = new Map(volume);
    periods = price.map(([p]) => p).filter((p) => vmap.has(p));
    if (!periods.length) periods = price.map(([p]) => p);
    price = periods.filter((p) => pmap.has(p)).map((p) => [p, pmap.get(p)!]);
    volume = periods.filter((p) => vmap.has(p)).map((p) => [p, vmap.get(p)!]);
  } else if (price.length) {
    periods = price.map(([p]) => p);
  } else {
    periods = volume.map(([p]) => p);
  }

  const end = input.periodEnd || (periods.length ? periods[periods.length - 1] : "");
  const title = `${input.city}楼市价量走势${end ? `（截至 ${end}）` : ""}`;
  const asciiCity = cityAscii(input.city);
  const x0 = 80;
  const x1 = 680;

  const pvals = price.map(([, v]) => v);
  let pmin = 0;
  let pmax = 1;
  if (pvals.length) {
    pmin = Math.min(...pvals);
    pmax = Math.max(...pvals);
    const pad = (pmax - pmin) * 0.08 || Math.max(Math.abs(pmax) * 0.02, 1);
    pmin -= pad;
    pmax += pad;
  }
  const pLine = polyline(pvals, { x0, x1, yTop: 95, yBot: 215, vmin: pmin, vmax: pmax });

  const vvals = volume.map(([, v]) => v);
  let vmin = 0;
  let vmax = 1;
  if (vvals.length) {
    vmin = Math.min(...vvals);
    vmax = Math.max(...vvals);
    if (vmin >= 0) vmin = 0;
    const pad = (vmax - vmin) * 0.08 || Math.max(Math.abs(vmax) * 0.02, 1);
    vmax += pad;
  }
  const vLine = polyline(vvals, { x0, x1, yTop: 275, yBot: 355, vmin, vmax });

  const ticks = (lo: number, hi: number, yTop: number, yBot: number, n = 4) => {
    const out: Array<[number, string]> = [];
    for (let i = 0; i < n; i++) {
      const t = n > 1 ? i / (n - 1) : 0;
      out.push([yTop + (yBot - yTop) * t, fmtAxis(hi - (hi - lo) * t)]);
    }
    return out;
  };
  const pTicks = ticks(pmin, pmax, 95, 215);
  const vTicks = ticks(vmin, vmax, 275, 355, 3);

  const xlab: Array<[number, string]> = [];
  if (periods.length) {
    const idxs = [
      ...new Set([
        0,
        Math.floor(periods.length / 5),
        Math.floor((2 * periods.length) / 5),
        Math.floor((3 * periods.length) / 5),
        Math.floor((4 * periods.length) / 5),
        periods.length - 1,
      ]),
    ].sort((a, b) => a - b);
    for (const i of idxs) {
      const x = periods.length === 1 ? x0 : x0 + ((x1 - x0) * i) / (periods.length - 1);
      xlab.push([x, shortPeriod(periods[i]!)]);
    }
  }

  const gridP = pTicks.map(([y]) => `  <line x1="80" y1="${Math.round(y)}" x2="680" y2="${Math.round(y)}" stroke="#dddddd"/>`).join("\n");
  const labelsP = pTicks
    .map(
      ([y, lab]) =>
        `  <text x="22" y="${Math.round(y + 4)}" font-family="Arial, Helvetica, sans-serif" font-size="10" fill="#666666">${lab}</text>`,
    )
    .join("\n");
  const gridV = vTicks.map(([y]) => `  <line x1="80" y1="${Math.round(y)}" x2="680" y2="${Math.round(y)}" stroke="#dddddd"/>`).join("\n");
  const labelsV = vTicks
    .map(
      ([y, lab]) =>
        `  <text x="22" y="${Math.round(y + 4)}" font-family="Arial, Helvetica, sans-serif" font-size="10" fill="#666666">${lab}</text>`,
    )
    .join("\n");
  const circlesP = pLine.xy.map(([x, y]) => `    <circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3"/>`).join("\n");
  const circlesV = vLine.xy.map(([x, y]) => `    <circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3"/>`).join("\n");
  const xLabels = xlab.map(([x, lab]) => `    <text x="${x.toFixed(1)}" y="372">${lab}</text>`).join("\n");

  const priceBlock = pLine.pts
    ? `  <text x="48" y="78" font-family="Arial, Helvetica, sans-serif" font-size="12" fill="#333333">PRICE</text>
${gridP}
${labelsP}
  <polyline points="${pLine.pts}" fill="none" stroke="#c2413b" stroke-width="3"/>
  <g fill="#c2413b">
${circlesP}
  </g>`
    : "";

  const volBlock = vLine.pts
    ? `  <text x="48" y="258" font-family="Arial, Helvetica, sans-serif" font-size="12" fill="#333333">VOLUME</text>
${gridV}
${labelsV}
  <polyline points="${vLine.pts}" fill="none" stroke="#2878b5" stroke-width="3"/>
  <g fill="#2878b5">
${circlesV}
  </g>`
    : "";

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="380" viewBox="0 0 720 380">
  <rect x="0" y="0" width="720" height="380" fill="#ffffff"/>
  <text x="48" y="28" font-family="Arial, Helvetica, sans-serif" font-size="16" fill="#222222">${asciiCity} MARKET</text>
  <text x="48" y="48" font-family="Arial, Helvetica, sans-serif" font-size="11" fill="#666666">PRICE AND VOLUME TREND</text>
${priceBlock}
${volBlock}
  <g font-family="Arial, Helvetica, sans-serif" font-size="10" fill="#666666" text-anchor="middle">
${xLabels}
  </g>
</svg>`;

  return { title, svg, markdown: `${title}\n${svg}` };
}
