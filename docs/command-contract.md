# zyt 命令契约

双实现（TypeScript / Python）必须对齐本文档。二进制名均为 `zyt`（同一环境通常只安装其一；也可用 `npx` / `python -m zyt`）。

## 全局

```
zyt [--json] [--base-url <url>] [--api-key <key>] <command> [options]
```

| Flag | 说明 |
|------|------|
| `--json` | stdout 输出纯 JSON；错误亦为 JSON |
| `--insecure` / `-k` | 跳过 TLS 校验（测试环境自签证书）；也可用 `ZYT_INSECURE=1` |
| `--base-url` | 覆盖 Base URL |
| `--api-key` | 覆盖 API Key |

默认 Base URL：`https://dss.ke.com`  
备用测试域：内网测试环境（自签证书，需 `--insecure`；地址向管理员索取）  
鉴权 Header：`X-Api-Key`  
客户端默认附带浏览器 `User-Agent`（避免贝壳 WAF 拦截默认 undici / Python-urllib）。

配置优先级：CLI flag > `ZYT_API_KEY` / `ZYT_BASE_URL` > **仓库 `.zyt/config.json`** > `~/.config/zyt/config.json`  

申请 API Key：向智见开放 API 管理员申请（无公开自助页）。`zyt 配置 设置` 在仓库内优先写入**本地** `.zyt/config.json`（gitignore，模板 `.zyt/config.example.json`）。

专家服务：`expertsMode`=`remote`（发行版默认）| `local`（需 `ZYT_EXPERT_LIBRARY` 指向自建专家库 JSON）；`expertsRemoteUrl` 配置远程服务 URL。环境变量 `ZYT_EXPERTS_MODE` / `ZYT_EXPERTS_REMOTE_URL`。

版本检查（`更新` / `update`）：读取 GitHub `release` 分支 `ZYT_AGENT_VERSION` 与本地比对。默认对照 `scubiry-glitch/zhijian-cli-public`；可选 `ZYT_RELEASE_REPO` / `ZYT_RELEASE_BRANCH`。


### 退出码

| Code | 含义 |
|------|------|
| 0 | 成功 |
| 1 | 业务/参数错误 |
| 2 | 鉴权失败（401 / 缺 Key） |
| 3 | 网络或 5xx |

### JSON 错误

```json
{ "error": { "code": "INVALID_API_KEY", "message": "...", "httpStatus": 401 } }
```

## 参数别名（全局约定）

| 英文 | 中文长选项 |
|------|------------|
| `--city` | `--城市` |
| `--code` | `--指标` |
| `--cities` | `--城市列表` |
| `--period` | `--月份` |
| `--ym` | `--年月`（格式 YYYYMM，如 `202609`） |
| `--period-end` | `--截止月` |
| `--limit` | `--期数` |
| `--granularity` | `--粒度` |
| `--district` | `--行政区` / `--城区` |
| `--bizcircle` | `--商圈` |
| `--community` | `--小区` |
| `--caliber` | `--口径` |
| `--geo-id` | `--地理编码` |
| `--include-peers` | `--含同级` |
| `--include-city-ref` | `--含城市基准` |
| `--q` / `--query` | `--关键词` |
| `--category` | `--分类` |
| `--queries` | `--查询` |
| `--queries-file` | `--查询文件` |

## 子命令

| 中文 | 英文别名 | Method | Path | 主要参数 |
|------|----------|--------|------|----------|
| `身份` | `me` | GET | `/openapi/v1/me` | — |
| `指标目录` | `indicators catalog` | GET | `/openapi/v1/indicators/catalog` | — |
| `指标时序` | `indicators series` | GET | `/openapi/v1/indicators/series` | city*, code*, granularity, district, bizcircle, community, periodEnd, limit, caliber |
| `批量时序` | `indicators batch-series` | POST | `/openapi/v1/indicators/batch-series` | city*, queries*|queries-file*, periodEnd, limit |
| `多城对比` | `indicators compare` | GET | `/openapi/v1/indicators/compare` | cities*, code, period |
| `地理数据包` | `geo scope-bundle` | GET | `/openapi/v1/geo/scope-bundle` | city*, geoId, periodEnd, includePeers, includeCityRef |
| `地理时序` | `geo series` | GET | `/openapi/v1/geo/series` | city*, code\|key, granularity, district, bizcircle, community, periodEnd, limit |
| `地理树` | `geo tree` | GET | `/openapi/v1/geo/tree` | city* |
| `地理搜索` | `geo search` | GET | `/openapi/v1/geo/search` | city*, q* |
| `行政区分布` | `districts` | GET | `/openapi/v1/districts` | city*, code, period |
| `市场快照` | `market-snapshot` | GET | `/openapi/v1/market-snapshot` | city*, period |
| `报告列表` | `reports` / `reports list` | GET | `/openapi/v1/reports` | city, period |
| `报告详情` | `reports get` | GET | `/openapi/v1/reports/:id` | id*（位置参数） |
| `政策列表` | `policies` / `policies list` | GET | `/openapi/v1/policies` | city, category |
| `城市专报 城市级` | `city-report2026 city` | GET | `/openapi/v1/city-report2026/city` | city*, ym* |
| `城市专报 面积` | `city-report2026 area` | GET | `/openapi/v1/city-report2026/area` | city*, ym* |
| `城市专报 城区` | `city-report2026 district` | GET | `/openapi/v1/city-report2026/district` | city*, ym*, district（`--城区`，可选） |
| `城市专报 总价` | `city-report2026 total-price` | GET | `/openapi/v1/city-report2026/total-price` | city*, ym* |
| `中指 土地统计` | `creis land-market` | GET | `/openapi/v1/creis/land-market` | city*, ym* |
| `中指 土地明细` | `creis land-transaction` | GET | `/openapi/v1/creis/land-transaction` | city*（该表无年月） |
| `中指 新房统计` | `creis new-home-market` | GET | `/openapi/v1/creis/new-home-market` | city*, ym* |
| `中指 新房项目` | `creis new-home-project` | GET | `/openapi/v1/creis/new-home-project` | city*, ym* |
| `中指 二手统计` | `creis resale-market` | GET | `/openapi/v1/creis/resale-market` | city*, ym* |
| `配置 查看` | `config show` | — | 本地 | — |
| `配置 设置` | `config set` | — | 本地 | `--api-key` / `--base-url` 写入本地 `.zyt/config.json`（gitignore）或家目录 |
| `更新` | `update` | — | 本地 | 检查 GitHub [`release`](https://github.com/scubiry-glitch/zhijian-cli-public/tree/release) 分支 `ZYT_AGENT_VERSION` |
| `解读`（同义：`分析`/`研判`/`点评`/`诊断`） | `experts brief`（同义：`analyze`/`analysis`/`outlook`/`interpret`） | — | 编排 | city*/topic*；可选 industry/importance/task/code/limit/expert-id；`--markdown` 半成品；`--写图/--chart-out` SVG 落盘；打包身份+批量时序+匹配+outputContract |
| `专家匹配` | `experts match` | — | local/remote | topic*/industry/importance/task/expert-id；local 需 `ZYT_EXPERT_LIBRARY` |

`*` = 必填。`periodEnd` CLI 写作 `--period-end` / `--截止月`；query 键仍为 `periodEnd`（camelCase，与 OpenAPI 一致）。布尔：`--include-peers` 传 `1`，缺省按 API 默认。

## Request Plan（契约测试）

两端导出 `buildRequestPlan(argv: string[])` →

```json
{
  "command": "指标时序",
  "method": "GET",
  "path": "/openapi/v1/indicators/series",
  "query": { "city": "北京", "code": "SH_PRICE" },
  "body": null
}
```

本地 `配置` 命令返回 `{ "command": "配置", "local": true, ... }`，不参与 HTTP 比对。
