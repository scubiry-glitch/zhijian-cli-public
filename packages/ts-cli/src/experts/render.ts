import fs from "node:fs";
import path from "node:path";

export function renderBriefMarkdown(brief: Record<string, any>): string {
  const city = brief.city || "";
  const topic = brief.topic || "";
  const data = brief.data || {};
  const dataView = data.dataView;
  const periodEnd = data.periodEnd;
  const seriesByCode = (data.seriesByCode || {}) as Record<string, any>;
  const chartSvg = (brief.chartSvg || {}) as Record<string, any>;
  const analysts = (brief.analysts || []) as any[];
  const followups = (brief.followupQuestions || []) as any[];
  const recommended = (brief.recommendedExperts || []) as any[];

  const lines: string[] = [
    `# ${city} · ${topic}`,
    "",
    `- dataView: \`${dataView}\``,
    `- periodEnd: \`${periodEnd}\``,
    `- zytAgentVersion: \`${brief.zytAgentVersion}\``,
    "",
    "## 数据底稿",
    "",
  ];

  let codes = ((brief.codes as string[]) || Object.keys(seriesByCode)).filter((c) => seriesByCode[c]);
  if (!codes.length) codes = Object.keys(seriesByCode);

  const periodMap = new Map<string, Record<string, unknown>>();
  for (const code of codes) {
    for (const row of seriesByCode[code]?.series || []) {
      const p = String(row?.period || "");
      if (!p) continue;
      const slot = periodMap.get(p) || {};
      slot[code] = row.display_value ?? row.value;
      periodMap.set(p, slot);
    }
  }
  const periods = [...periodMap.keys()].sort();
  if (periods.length && codes.length) {
    lines.push(`| period | ${codes.join(" | ")} |`);
    lines.push(`|--------|${codes.map(() => "------").join("|")}|`);
    for (const p of periods) {
      const row = periodMap.get(p) || {};
      lines.push(`| ${p} | ${codes.map((c) => String(row[c] ?? "")).join(" | ")} |`);
    }
  } else {
    lines.push("（无时序数据）");
  }

  lines.push("", "## 图表", "");
  const chartPath = chartSvg.filePath || chartSvg.path;
  if (chartPath) {
    lines.push(String(chartSvg.title || `${city}楼市价量走势`));
    lines.push(`图表文件：\`${chartPath}\``);
    lines.push("（请在浏览器/预览中打开；Codex 勿在终端粘贴 SVG 源码）");
  } else if (chartSvg.markdown) {
    lines.push(String(chartSvg.markdown));
  } else if (chartSvg.svg) {
    lines.push(String(chartSvg.title || `${city}楼市价量走势`));
    lines.push(String(chartSvg.svg));
  } else {
    lines.push("（无图表；可用 `--写图 path.svg` 落盘）");
  }

  lines.push("", "## 分析员解读（请续写，每位约 500 字）", "");
  if (!analysts.length) lines.push("（未匹配到分析员）");
  for (const a of analysts) {
    const tag = a.tag || `【分析员 · ${a.expert_id} · ${a.title}】`;
    lines.push(tag, "");
    lines.push("（在此续写：结论先行；装载 mentalModels/frameworks；按 outputContract 交付）", "");
    const frameworks = a.frameworks || [];
    if (frameworks.length) lines.push(`- 可用框架：${frameworks.slice(0, 6).join(", ")}`);
    if (a.mentalModel) lines.push(`- 心智摘要：${String(a.mentalModel).slice(0, 180)}`);
    lines.push("");
  }

  lines.push("## 对照表", "", "| 分析员 tag | 核心判断 | 信心 |", "|------------|----------|------|");
  for (const a of analysts) {
    lines.push(`| ${a.expert_id} · ${a.title} | （续写） | （续写） |`);
  }

  lines.push("", "## 推荐继续问", "");
  followups.slice(0, 3).forEach((q, i) => {
    if (q && typeof q === "object") {
      lines.push(`${i + 1}. ${q.question}`);
      if (q.suggestedCommand) lines.push(`   - 建议：\`${q.suggestedCommand}\``);
    } else {
      lines.push(`${i + 1}. ${q}`);
    }
  });

  lines.push("", "## 推荐专家", "");
  if (!recommended.length) lines.push("（无）");
  for (const r of recommended.slice(0, 3)) {
    lines.push(`- ${r.tag || r.expert_id}`);
  }
  lines.push("");
  return lines.join("\n");
}

export function writeChartFile(brief: Record<string, any>, chartOut: string): string {
  const chartSvg = brief.chartSvg;
  if (!chartSvg || typeof chartSvg !== "object" || !chartSvg.svg) {
    throw new Error("brief 无 chartSvg.svg，无法写图");
  }
  const resolved = path.resolve(chartOut);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, String(chartSvg.svg), "utf8");
  chartSvg.filePath = resolved;
  const title = chartSvg.title || "价量走势";
  chartSvg.markdown = `${title}\n图表文件：\`${resolved}\`\n（请在浏览器/预览中打开）`;
  brief.chartSvg = chartSvg;
  return resolved;
}
