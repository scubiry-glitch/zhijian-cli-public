import { describe, expect, it } from "vitest";
import { AGENT_VERSION, buildBrief } from "../src/experts/brief.js";

describe("buildBrief", () => {
  it("packs analysts charts and contract offline", () => {
    const brief = buildBrief({
      city: "北京",
      topic: "北京楼市见底了吗",
      industry: "房地产",
      importance: 0.9,
      identity: { cities: ["北京", "上海"], dataView: "external" },
      seriesPayload: {
        periodEnd: "2026-07",
        dataView: "external",
        results: [
          {
            code: "SH_PRICE",
            indexed: false,
            granularity: "month",
            series: [
              { period: "2026-06", value: 60000, display_value: "60000" },
              { period: "2026-07", value: 59000, display_value: "59000" },
            ],
          },
          {
            code: "SH_VOL",
            indexed: true,
            granularity: "month",
            series: [
              { period: "2026-06", value: 100, display_value: "100" },
              { period: "2026-07", value: 110, display_value: "110" },
            ],
          },
        ],
      },
    });
    expect(brief.zytAgentVersion).toBe(AGENT_VERSION);
    expect(brief.command).toBe("解读");
    expect((brief.identity as any).cityAllowed).toBe(true);
    expect(Object.keys((brief.data as any).seriesByCode)).toContain("SH_PRICE");
    expect((brief.charts as any[]).length).toBe(2);
    expect(brief.chartSvg).toBeTruthy();
    expect((brief.chartSvg as any).svg).toContain("BEIJING MARKET");
    expect((brief.chartSvg as any).svg).toContain("<svg");
    expect((brief.analysts as any[]).length).toBeGreaterThan(0);
    expect((brief.analysts as any[]).length).toBeLessThanOrEqual(3);
    expect((brief.followupQuestions as any[]).length).toBe(3);
    expect((brief.outputContract as any).maxAnalysts).toBe(3);
  });
});
