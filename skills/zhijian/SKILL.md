---
name: zhijian
description: >-
  Queries Beike Zhijian (智见) open API via the zyt CLI for city indicators,
  geo drill-down, market snapshots, reports, and policies. Use when the user
  mentions 智见、政研通、zyt、开放 API、城市指标、市场快照、月报、政策列表,
  or needs housing-market data from Zhijian / Zhengyan Tong openapi.
---

# 智见 zyt Skill

**ZYT_AGENT_VERSION=`2026.08.12-2`**  
（核对：仓库根 `ZYT_AGENT_VERSION` 与本文件应一致。）

## 何时使用

用项目内 `zyt` CLI 调用智见开放 API（O-01～O-14）。优先中文命令；Agent **必须**加 `--json`。

本 Skill 应**全局安装**（`~/.codex/skills/zhijian/` 与 `~/.cursor/skills/zhijian/`），仓库内亦保留 `skills/zhijian/` 副本。

## 前置检查

1. 确认已安装其一：`packages/ts-cli`（`npm install && npm run build && npm link`）或 `pip install -e .`
2. **API Key**（用户提供后写入**本地** `.zyt/config.json`，已 gitignore，**勿提交**；勿只放会话环境后丢失）：
   - 首次可 `cp .zyt/config.example.json .zyt/config.json`
   - 推荐：`zyt 配置 设置 --api-key <key>`（在仓库根目录执行，写入本地 `.zyt/config.json`）
   - 或直接编辑 `.zyt/config.json` 的 `apiKey` 字段
   - 亦可 `export ZYT_API_KEY=btg_...`（优先级高于文件，但不持久）
   - **申请 Key**：向智见开放 API 管理员申请（无公开自助申请页）
3. 可选：`ZYT_BASE_URL`（默认 `https://dss.ke.com`；内网测试域需 `--insecure`，地址向管理员索取）
4. 仅备用测试域需要自签跳过：加 `--insecure` / `-k`，或 `export ZYT_INSECURE=1`

配置优先级：CLI flag > 环境变量 > **仓库 `.zyt/config.json`** > `~/.config/zyt/config.json`

## WAF / User-Agent

贝壳网关 WAF 会拦截默认客户端 UA（`undici`、`Python-urllib/3.x`），表现为 HTTP 403 + HTML「访问已被拦截」。  
CLI 已默认带浏览器 `User-Agent`。若仍见 `WAF_BLOCKED`，先确认使用本仓库最新 CLI，再联系 API 管理员。

## 两条入口（先选对）

| 用户意图 | 只跑什么 | 禁止 |
|----------|----------|------|
| **查数**（趋势/对比/分布） | `身份`（必要时）+ 时序/对比等取数命令 | 不必专家 |
| **研判**（见底了吗/怎么看/解读） | **`zyt 解读 --城市 … --议题 … --markdown --写图 docs/samples/_charts/….svg --json`**（同义：分析/研判/点评/诊断） | 禁止只跑 `专家匹配` 就停；Codex 勿在聊天贴 SVG 源码 |

```
Task Progress:
- [ ] 若用户刚提供 Key → 写入本地 `.zyt/config.json`（勿 git add）
- [ ] 判意图：查数 or 研判
- [ ] 查数 → 对应取数命令 --json → 结论+表
- [ ] 研判 → zyt 解读 --城市 … --议题 … --行业 房地产 --markdown --写图 docs/samples/_charts/{city}.svg --json
- [ ] **必须续写**：按 markdown 半成品 / analysts / followupQuestions / outputContract 输出完整答案
```

规范：`解读` 返回的 `outputContract` / `--markdown` 半成品（分析员 tag≤3、图表、3 问+荐专家）。

### 研判交付物（硬性；`解读` 已打包素材）

优先跑：

```bash
zyt 解读 --城市 南京 --议题 '…' --行业 房地产 --markdown --写图 docs/samples/_charts/nanjing-price-vol.svg --json
```

- `--markdown`：吐出底稿表 + 图表路径 + 分析员续写骨架（减少漏交付）
- `--写图`：SVG 落盘；Codex 对话只引文件路径

`zyt 解读` 返回 JSON **不是终点**。Agent 必须继续输出：

1. **数据底稿**：已在 `--markdown` 半成品中；或用 `data.seriesByCode`（注明 `dataView`）
2. **图表（防乱码）**：
   - **Codex 终端**：使用 `--写图` 生成的路径；**禁止**在聊天里贴大段 SVG 源码
   - **Cursor**：可原样粘贴 `chartSvg.markdown`（若未写图）；勿代码围栏 / Mermaid
3. **分析员解读 ≤3**：每篇首行用预填 `analysts[].tag`，装载 mentalModels/frameworks，约 500 字
4. **对照表**（可选）
5. **推荐继续问 ×3** / **推荐专家 ≤3**

**勿**再单独串「批量时序 + 专家匹配」代替 `解读`（除非调试）。

## 查询场景最佳实践（查数）

| # | 典型问题 | 推荐做法 |
|---|----------|----------|
| 1 | 查询短期成交趋势 | `指标时序 --城市 … --指标 SH_VOL --期数 6` |
| 2 | 房价近一年怎么走 | `指标时序 --城市 … --指标 SH_PRICE --期数 12` |
| 3 | 价量一起看 | `批量时序 --城市 … --查询 '[{"code":"SH_PRICE"},{"code":"SH_VOL"}]'` |
| 4 | 北京和上海谁成交更强 | `多城对比 --城市列表 北京,上海 --指标 SH_VOL` |
| 5 | 某商圈/行政区趋势 | 先 `地理搜索`，再 `地理时序` |
| 6 | 不知道有哪些指标 | `指标目录`（响应字段为 `entries`） |
| 7 | 本月城市市场概览 | ❌ 勿 `市场快照`；改价+量批量时序 |
| 8 | 区县成交分布 | `行政区分布 --城市 …` |
| 9 | 多城房价横向对比 | `多城对比 --城市列表 … --指标 SH_PRICE` |
| 10 | 近两年成交走势 | `指标时序 --城市 … --指标 SH_VOL --期数 24` |
| 11 | **见底了吗 / 怎么解读** | **`解读 --城市 … --议题 '…'`** |

样例报告：`docs/samples/`。

## 联调状态（`https://dss.ke.com`）

| 命令 | 状态 | 说明 |
|------|------|------|
| `市场快照` | ❌ | 500；勿依赖 |
| `指标目录` | ⚠️ | 响应为 `entries` |
| 地理名称下钻 | ⚠️ | 区县用 `行政区分布` |

已冒烟：`身份`、时序类、`解读`（编排）。

## 常用命令

```bash
zyt 身份 --json
zyt 指标时序 --城市 北京 --指标 SH_PRICE --期数 12 --json
zyt 批量时序 --城市 北京 --查询 '[{"code":"SH_PRICE"},{"code":"SH_VOL"}]' --json
zyt 解读 --城市 北京 --议题 '北京楼市见底了吗？' --行业 房地产 --json
# 同义：zyt 分析 / zyt 研判 / zyt 点评 / zyt 诊断
# ❌ 市场快照：暂勿用
```

英文别名与全参数见 [reference.md](reference.md) 与仓库 `docs/command-contract.md`。

## 错误处理

| exit | 含义 |
|------|------|
| 2 | 鉴权失败 / 缺 Key |
| 1 | 参数或业务错误 |
| 3 | 网络 / 5xx / `WAF_BLOCKED` |

## 规则

- 用户提供的 Key **写入本地** `.zyt/config.json`（gitignore）；对话中不要反复回显完整 Key，**不要提交 Key**
- 城市必须在 `身份.cities` 授权列表内（`解读` 会返回 `identity.cityAllowed`）
- 查数：结论摘要 + 数据表；研判：必须完整交付（tag≤3、图表、3 问+荐专家）
- **Codex**：图表用 `.svg` 文件，勿在终端贴 SVG 源码；**Cursor**：可裸嵌 `chartSvg.markdown`
- 禁止只回匹配/`解读` JSON；禁止 Mermaid；禁止真名与金句
