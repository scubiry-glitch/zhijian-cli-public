# 智见 zyt CLI

人机双用的贝壳智见开放 API 命令行：TypeScript 与 Python 双实现、同命令面（中文主命令 + 英文别名）。Agent 通过项目内 Skill 调用时**必须**加 `--json`。

| | |
|--|--|
| 默认 Base URL | `https://dss.ke.com` |
| 备用测试域 | 内网测试环境（需 `--insecure`；具体地址向管理员索取） |
| 鉴权 | Header `X-Api-Key`（`btg_` 开头）+ 浏览器 User-Agent（防 WAF） |
| Skill（全局） | `~/.codex/skills/zhijian/`、`~/.cursor/skills/zhijian/` |
| Skill（仓库） | [`skills/zhijian/`](skills/zhijian/) |
| API Key | 本地 [`.zyt/config.json`](.zyt/config.example.json)（gitignore；模板见 example；向智见开放 API 管理员申请） |
| 命令契约 | [`docs/command-contract.md`](docs/command-contract.md) |
| 查询样例报告 | [`docs/samples/`](docs/samples/) |
| Agent 版本 | **ZYT_AGENT_VERSION=`2026.08.12-2`**（核对文件：[`ZYT_AGENT_VERSION`](ZYT_AGENT_VERSION)） |

## 安装

同一环境请只安装/link 其中一套，避免全局 `zyt` 互相覆盖。

### TypeScript

```bash
cd packages/ts-cli
npm install
npm run build
npm link          # 提供全局 zyt
```

开发态（无需 link）：

```bash
npm run zyt -- 身份 --json
```

### Python

```bash
pip install -e .
# 或
PYTHONPATH=python python -m zyt --help
```

## 配置

优先级：CLI flag（`--api-key` / `--base-url` / `--insecure` / `--专家模式` / `--专家服务`）> 环境变量 `ZYT_API_KEY` / `ZYT_BASE_URL` / `ZYT_INSECURE` / `ZYT_EXPERTS_MODE` / `ZYT_EXPERTS_REMOTE_URL` > **仓库 `.zyt/config.json`** > `~/.config/zyt/config.json`。

**申请 API Key**：向智见开放 API 管理员申请（无公开自助页）。用户提供 Key 后写入**本地** `.zyt/config.json`（已 gitignore，勿提交）：

```bash
cp .zyt/config.example.json .zyt/config.json   # 首次
zyt 配置 设置 --api-key btg_xxxx   # 在仓库根目录执行 → 写入本地 .zyt/config.json
zyt 配置 设置 --专家模式 remote     # 发行版默认；local 需 ZYT_EXPERT_LIBRARY 指向自建库
zyt 配置 查看
zyt 更新 --json                      # 检查 GitHub release 分支是否有新版本
zyt 身份 --json
```

- 默认 `dss.ke.com` 一般**不需要** `--insecure`
- 仅备用测试域自签证书时加 `-k` / `--insecure`，或 `export ZYT_INSECURE=1`
- HTTP 客户端已带浏览器 `User-Agent`；若返回 `WAF_BLOCKED`（403 HTML「访问已被拦截」），先升级/重装本仓库 CLI

### 版本检查（`zyt 更新`）

对照 GitHub [`release`](https://github.com/scubiry-glitch/zhijian-cli-public/tree/release) 分支的 `ZYT_AGENT_VERSION` 判断是否有新版本：

```bash
zyt 更新              # 人类可读
zyt 更新 --json       # Agent / 脚本
```

可选环境变量：`ZYT_RELEASE_REPO`（默认 `scubiry-glitch/zhijian-cli-public`）、`ZYT_RELEASE_BRANCH`（默认 `release`）。

## 快速开始

```bash
zyt 身份 --json                                          # 确认 cities、dataView
zyt 指标时序 --城市 北京 --指标 SH_VOL --期数 6 --json     # 短期成交
zyt 指标时序 --城市 北京 --指标 SH_PRICE --期数 12 --json  # 近一年房价
zyt 多城对比 --城市列表 北京,上海 --指标 SH_VOL --json
zyt 解读 --城市 北京 --议题 '北京楼市见底了吗？' --行业 房地产 --markdown --写图 docs/samples/_charts/beijing-price-vol.svg --json  # 研判主入口
```

常用 code：`SH_PRICE`（二手成交价）、`SH_VOL`（二手成交量）。不确定时先看目录（响应字段为 `entries`，不是文档里的 `indicators`）：

```bash
zyt 指标目录 --json
```

人类可读输出省略 `--json`；Agent / 脚本一律加 `--json`。

## 推荐查询场景

推荐查询场景见 [`docs/samples/README.md`](docs/samples/README.md)。摘要：

| 场景 | 命令要点 |
|------|----------|
| 短期成交 / 近一年房价 | `指标时序` + `SH_VOL` / `SH_PRICE` |
| 价量一起看 / 本月概览 | `批量时序`（❌ 暂勿依赖 `市场快照`，联调 500） |
| 多城对比 | `多城对比`（城市须在 `身份.cities` 内） |
| 区县分布 | `行政区分布`（区级为示意拆分，见接口 disclaimer） |
| 商圈下钻 | 先 `地理搜索`；名称下钻目前常空，慎用 |
| 未来走势 / 企稳研判 | **`zyt 解读 --城市 … --议题 '…' --markdown --写图 …`**（需配置远程专家服务 `expertsRemoteUrl`） |

## 数据版本

`zyt 身份` 返回的 `dataView`：

- `internal`：量类为真实绝对量
- `external`：量类（成交 / 带看 / 挂牌）指数化（首个非空值=100），**勿当绝对量**解读

## 退出码

| Code | 含义 |
|------|------|
| 0 | 成功 |
| 1 | 业务 / 参数错误（如 `CITY_NOT_ALLOWED`） |
| 2 | 鉴权失败 / 缺 Key |
| 3 | 网络 / 5xx / `WAF_BLOCKED` |

JSON 错误形态：`{ "error": { "code", "message", "httpStatus?" } }`。

## 测试

```bash
cd packages/ts-cli && npm test
pytest
node scripts/compare-request-plans.mjs
```

## 文档

- 命令契约：[`docs/command-contract.md`](docs/command-contract.md)
- Skill：[`skills/zhijian/`](skills/zhijian/)（全局副本：`~/.codex/skills/zhijian/`、`~/.cursor/skills/zhijian/`）
- Key 说明：[`.zyt/README.md`](.zyt/README.md)
- 查询样例：[`docs/samples/`](docs/samples/)
