# 智见 API 配置（本地）

- **本地文件**（已 gitignore，勿提交）：`.zyt/config.json`（`apiKey`、`baseUrl`、`expertsMode`、`expertsRemoteUrl`）
- **模板**：复制 [`config.example.json`](config.example.json) 为 `config.json` 后填入自己的 Key
- **申请 Key**：向智见开放 API 管理员申请（当前流程未公开自助申请页）
- **Agent 约定**：用户一旦在对话中提供 Key，立即写入**本地** `.zyt/config.json`（`zyt 配置 设置 --api-key …` 或直接编辑），**不要提交到 git**
- **优先级**：CLI `--api-key` > `ZYT_API_KEY` > 本文件 > `~/.config/zyt/config.json`
- **专家服务**：`expertsMode`=`remote`（发行版默认）| `local`（需 `ZYT_EXPERT_LIBRARY` 指向专家库 JSON）  
  环境变量：`ZYT_EXPERTS_MODE` / `ZYT_EXPERTS_REMOTE_URL` / `ZYT_EXPERT_LIBRARY`；CLI：`--专家模式` / `--专家服务`

若 Key 曾进入 git 历史，请联系管理员轮换后再写入本地配置。
