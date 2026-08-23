# zyt 命令速查

**ZYT_AGENT_VERSION=`2026.08.12-2`**

默认 Base URL：`https://dss.ke.com`（备用测试域需 `--insecure`）  
Header：`X-Api-Key` + 浏览器 `User-Agent`（防贝壳 WAF）  
全局：`--json` `--base-url` `--api-key` `--insecure`

配置：CLI flag > env > **仓库 `.zyt/config.json`** > `~/.config/zyt/config.json`  
申请 Key：向智见开放 API 管理员申请

## 命令

| 中文 | 英文别名 | 路径 | 联调 |
|------|----------|------|------|
| 身份 | me | GET /openapi/v1/me | ✅ |
| 指标目录 | indicators catalog | GET /openapi/v1/indicators/catalog | ⚠️ 响应为 `entries`，非文档 `indicators` |
| 指标时序 | indicators series | GET /openapi/v1/indicators/series | ✅ |
| 批量时序 | indicators batch-series | POST /openapi/v1/indicators/batch-series | ✅ |
| 多城对比 | indicators compare | GET /openapi/v1/indicators/compare | ✅ |
| 地理数据包 | geo scope-bundle | GET /openapi/v1/geo/scope-bundle | ⚠️ |
| 地理时序 | geo series | GET /openapi/v1/geo/series | ⚠️ |
| 地理树 | geo tree | GET /openapi/v1/geo/tree | ⚠️ 空 districts |
| 地理搜索 | geo search | GET /openapi/v1/geo/search | ✅ |
| 行政区分布 | districts | GET /openapi/v1/districts | ✅ 示意拆分 |
| 市场快照 | market-snapshot | GET /openapi/v1/market-snapshot | ❌ 500 INTERNAL_ERROR |
| 报告列表 | reports list | GET /openapi/v1/reports | ⚠️ 空 rows |
| 报告详情 | reports get | GET /openapi/v1/reports/:id | 未测 |
| 政策列表 | policies list | GET /openapi/v1/policies | 未测 |
| 配置 查看/设置 | config show/set | 本地 `.zyt/config.json`（gitignore）或 ~/.config/zyt/config.json | ✅ 本地 |
| 更新 | update | 检查 GitHub `release` 分支版本 | ✅ 本地 |
| 解读（同义：分析/研判/点评/诊断） | experts brief（analyze/outlook…） | 编排：身份+批量时序+匹配；`--markdown` 半成品；`--写图/--chart-out` 落盘 | ✅ 需 remote 或 local 库 |
| 专家匹配 | experts match | local/remote | local 需 `ZYT_EXPERT_LIBRARY` |

研判优先 `zyt 解读 --markdown --写图 …`；发行版默认 `expertsMode=remote`，需配置 `expertsRemoteUrl`。


## 常用 flag

`--城市/--city` `--指标/--code` `--城市列表/--cities` `--月份/--period` `--截止月/--period-end` `--期数/--limit` `--粒度/--granularity` `--行政区/--district` `--商圈/--bizcircle` `--小区/--community` `--口径/--caliber` `--地理编码/--geo-id` `--关键词/--q` `--分类/--category` `--查询/--queries` `--查询文件/--queries-file` `--含同级/--include-peers` `--含城市基准/--include-city-ref`

## 错误码

`INVALID_API_KEY` `API_KEY_EXPIRED` `CITY_NOT_ALLOWED` `PERMISSION_DENIED` `MISSING_PARAM` `INVALID_PARAM` `NOT_FOUND` `INTERNAL_ERROR` `MISSING_API_KEY` `NETWORK_ERROR` `WAF_BLOCKED`

## 指数化

`dataView=external`：量类指标指数化（首非空=100）。`internal`：真实绝对量。
