# 查询样例

公开仓库不包含含真实业务数据的样例报告（避免泄露内部口径与绝对量）。

请在本机配置 API Key 后自行实跑，参考根目录 [README.md](../../README.md)「推荐查询场景」：

```bash
zyt 身份 --json
zyt 指标时序 --城市 北京 --指标 SH_VOL --期数 6 --json
zyt 指标时序 --城市 北京 --指标 SH_PRICE --期数 12 --json
zyt 多城对比 --城市列表 北京,上海 --指标 SH_VOL --json
```

研判类命令需配置远程专家服务（`expertsRemoteUrl`）或本地专家库（`ZYT_EXPERT_LIBRARY`）。
