import { describe, expect, it } from "vitest";
import { inferRouteDomain, matchExperts } from "../src/experts/match.js";
import { renderBriefMarkdown, writeChartFile } from "../src/experts/render.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

describe("expert route + render", () => {
  it("monthly topic forces industry research", () => {
    const r = inferRouteDomain("北京楼市见底了吗？近12月量价");
    expect(r.primaryDomain).toBe("行业研究");
    expect(r.forceIndustryResearch).toBe(true);
  });

  it("policy topic routes to 政策制度", () => {
    const r = inferRouteDomain("如何理解最新调控政策与长效机制");
    expect(r.primaryDomain).toBe("政策制度");
  });

  it("monthly match prefers 行业研究 first", () => {
    const result = matchExperts({
      topic: "北京楼市月度量价走势见底了吗",
      industry: "房地产",
      importance: 0.9,
      task: "analysis",
    });
    expect(result.route?.primaryDomain).toBe("行业研究");
    expect(result.selected?.[0]?.primaryDomain).toBe("行业研究");
    expect((result.selected?.[0]?.matchReason || []).some((x: string) => String(x).includes("主领域"))).toBe(
      true,
    );
  });

  it("render markdown + write chart", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "zyt-chart-"));
    const out = path.join(dir, "n.svg");
    const brief: Record<string, any> = {
      city: "南京",
      topic: "价量",
      codes: ["SH_PRICE", "SH_VOL"],
      data: {
        dataView: "external",
        periodEnd: "2026-06",
        seriesByCode: {
          SH_PRICE: { series: [{ period: "2026-06", value: 19800 }] },
          SH_VOL: { series: [{ period: "2026-06", value: 110 }] },
        },
      },
      chartSvg: {
        title: "南京楼市价量走势（截至 2026-06）",
        svg: '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
        markdown: "南京楼市价量走势\n<svg></svg>",
      },
      analysts: [
        {
          expert_id: "BK-024",
          title: "行业研究·数据/研判/解读专家",
          tag: "【分析员 · BK-024 · 行业研究·数据/研判/解读专家】",
        },
      ],
      followupQuestions: [{ question: "q1" }],
      recommendedExperts: [{ tag: "【推荐 · BK-010 · x】" }],
    };
    writeChartFile(brief, out);
    expect(fs.existsSync(out)).toBe(true);
    expect(brief.chartSvg.filePath).toBe(path.resolve(out));
    const md = renderBriefMarkdown(brief);
    expect(md).toContain("数据底稿");
    expect(md).toContain("图表文件");
    expect(md).toContain("【分析员 · BK-024");
  });
});
