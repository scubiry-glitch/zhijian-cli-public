import { describe, expect, it } from "vitest";
import { buildRequestPlan } from "../src/request-plan.js";

describe("buildRequestPlan", () => {
  it("身份", () => {
    expect(buildRequestPlan(["身份"])).toEqual({
      command: "身份",
      method: "GET",
      path: "/openapi/v1/me",
      query: {},
      body: null,
    });
  });

  it("me alias", () => {
    expect(buildRequestPlan(["me"]).command).toBe("身份");
  });

  it("指标时序 with chinese flags", () => {
    expect(
      buildRequestPlan(["指标时序", "--城市", "北京", "--指标", "SH_PRICE", "--期数", "6"]),
    ).toEqual({
      command: "指标时序",
      method: "GET",
      path: "/openapi/v1/indicators/series",
      query: { city: "北京", code: "SH_PRICE", limit: "6" },
      body: null,
    });
  });

  it("批量时序", () => {
    const q = JSON.stringify([{ code: "SH_PRICE" }]);
    expect(buildRequestPlan(["批量时序", "--city", "北京", "--queries", q])).toEqual({
      command: "批量时序",
      method: "POST",
      path: "/openapi/v1/indicators/batch-series",
      query: {},
      body: { city: "北京", queries: [{ code: "SH_PRICE" }] },
    });
  });

  it("多城对比", () => {
    expect(buildRequestPlan(["多城对比", "--城市列表", "北京,上海", "--指标", "SH_VOL"])).toEqual({
      command: "多城对比",
      method: "GET",
      path: "/openapi/v1/indicators/compare",
      query: { cities: "北京,上海", code: "SH_VOL" },
      body: null,
    });
  });

  it("地理搜索", () => {
    expect(buildRequestPlan(["地理搜索", "--city", "北京", "--关键词", "望京"])).toMatchObject({
      path: "/openapi/v1/geo/search",
      query: { city: "北京", q: "望京" },
    });
  });

  it("报告详情", () => {
    expect(buildRequestPlan(["报告详情", "abc"])).toEqual({
      command: "报告详情",
      method: "GET",
      path: "/openapi/v1/reports/abc",
      query: {},
      body: null,
    });
  });

  it("配置 local", () => {
    expect(buildRequestPlan(["配置", "查看"])).toEqual({
      command: "配置",
      local: true,
      action: "show",
    });
  });

  it("解读 brief", () => {
    expect(
      buildRequestPlan(["解读", "--城市", "北京", "--议题", "见底了吗", "--行业", "房地产", "--期数", "6"]),
    ).toMatchObject({
      command: "解读",
      local: true,
      action: "brief",
      city: "北京",
      topic: "见底了吗",
      industry: "房地产",
      limit: "6",
    });
  });

  it("解读 --markdown --写图", () => {
    expect(
      buildRequestPlan([
        "解读",
        "--城市",
        "南京",
        "--议题",
        "见底了吗",
        "--markdown",
        "--写图",
        "docs/samples/_charts/nanjing.svg",
      ]),
    ).toMatchObject({
      command: "解读",
      markdown: true,
      chartOut: "docs/samples/_charts/nanjing.svg",
    });
  });

  it("experts brief alias", () => {
    expect(
      buildRequestPlan(["experts", "brief", "--city", "上海", "--topic", "how is the market"]),
    ).toMatchObject({
      command: "解读",
      city: "上海",
      topic: "how is the market",
    });
  });

  it("解读 synonyms 分析/研判", () => {
    for (const cmd of ["分析", "研判", "点评", "诊断"]) {
      expect(buildRequestPlan([cmd, "--城市", "北京", "--议题", "见底了吗"])).toMatchObject({
        command: "解读",
        city: "北京",
        topic: "见底了吗",
      });
    }
    for (const sub of ["analyze", "outlook", "研判"]) {
      expect(buildRequestPlan(["experts", sub, "--city", "北京", "--topic", "x"])).toMatchObject({
        command: "解读",
      });
    }
  });

  it("专家匹配", () => {
    expect(buildRequestPlan(["专家匹配", "--议题", "测试", "--行业", "房地产"])).toMatchObject({
      command: "专家匹配",
      local: true,
      topic: "测试",
    });
  });

  it("更新 / update", () => {
    expect(buildRequestPlan(["更新"])).toEqual({ command: "更新", local: true, action: "check" });
    expect(buildRequestPlan(["update"])).toEqual({ command: "更新", local: true, action: "check" });
  });

  it("城市专报城市级（中英别名）", () => {
    const expected = {
      command: "城市专报城市级",
      method: "GET",
      path: "/openapi/v1/city-report2026/city",
      query: { city: "北京", ym: "202609" },
      body: null,
    };
    expect(buildRequestPlan(["城市专报", "城市级", "--城市", "北京", "--年月", "202609"])).toEqual(expected);
    expect(buildRequestPlan(["city-report2026", "city", "--city", "北京", "--ym", "202609"])).toEqual(expected);
  });

  it("城市专报面积 / 总价", () => {
    expect(buildRequestPlan(["城市专报", "面积", "--城市", "北京", "--年月", "202609"])).toMatchObject({
      command: "城市专报面积结构",
      path: "/openapi/v1/city-report2026/area",
      query: { city: "北京", ym: "202609" },
    });
    expect(buildRequestPlan(["城市专报", "总价", "--城市", "北京", "--年月", "202609"])).toMatchObject({
      command: "城市专报总价结构",
      path: "/openapi/v1/city-report2026/total-price",
    });
  });

  it("城市专报城区级：district 可选", () => {
    expect(
      buildRequestPlan(["城市专报", "城区", "--城市", "北京", "--年月", "202609", "--城区", "朝阳区"]),
    ).toEqual({
      command: "城市专报城区级",
      method: "GET",
      path: "/openapi/v1/city-report2026/district",
      query: { city: "北京", ym: "202609", district: "朝阳区" },
      body: null,
    });
    expect(buildRequestPlan(["city-report2026", "district", "--city", "北京", "--ym", "202609"])).toEqual({
      command: "城市专报城区级",
      method: "GET",
      path: "/openapi/v1/city-report2026/district",
      query: { city: "北京", ym: "202609" },
      body: null,
    });
  });

  it("城市专报缺少 ym 报错且校验格式", () => {
    expect(() => buildRequestPlan(["城市专报", "城市级", "--城市", "北京"])).toThrow(/ym/);
    expect(() => buildRequestPlan(["城市专报", "城市级", "--城市", "北京", "--年月", "2026-09"])).toThrow(
      /YYYYMM/,
    );
    expect(() => buildRequestPlan(["城市专报", "城市级", "--城市", "北京", "--年月", "202613"])).toThrow(
      /YYYYMM/,
    );
  });

  it("中指 CREIS 统计类（city+ym，中英别名）", () => {
    const cases: Array<[string, string, string]> = [
      ["土地统计", "land-market", "/openapi/v1/creis/land-market"],
      ["新房统计", "new-home-market", "/openapi/v1/creis/new-home-market"],
      ["新房项目", "new-home-project", "/openapi/v1/creis/new-home-project"],
      ["二手统计", "resale-market", "/openapi/v1/creis/resale-market"],
    ];
    for (const [cn, en, path] of cases) {
      const expected = {
        command: `中指${cn}`,
        method: "GET",
        path,
        query: { city: "北京", ym: "202609" },
        body: null,
      };
      expect(buildRequestPlan(["中指", cn, "--城市", "北京", "--年月", "202609"])).toEqual(expected);
      expect(buildRequestPlan(["creis", en, "--city", "北京", "--ym", "202609"])).toEqual(expected);
    }
  });

  it("中指土地明细：仅 city，不发 ym", () => {
    const expected = {
      command: "中指土地明细",
      method: "GET",
      path: "/openapi/v1/creis/land-transaction",
      query: { city: "北京" },
      body: null,
    };
    expect(buildRequestPlan(["中指", "土地明细", "--城市", "北京"])).toEqual(expected);
    expect(buildRequestPlan(["creis", "land-transaction", "--city", "北京"])).toEqual(expected);
  });

  it("中指统计类缺 ym 报错；未知子命令报错", () => {
    expect(() => buildRequestPlan(["中指", "土地统计", "--城市", "北京"])).toThrow(/ym/);
    expect(() => buildRequestPlan(["creis", "nope", "--city", "北京", "--ym", "202609"])).toThrow(/中指子命令/);
  });
});
