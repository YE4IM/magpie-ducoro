# Ducoro 实机测试记录

日期：2026-11-06（Asia/Shanghai）。

本地 `magpie-ducoro-0.3.1` 已通过 Magpie 的插件安装命令加载。测试使用正在运行的
Ducoro daemon `2026.1104.1751` 和 Magpie `0.1.3080`，经 Ducoro 官方 CLI 提交真实
对话，并读取持久化回复、连接状态及 Magpie 路由日志核验。

| 检查 | 实际结果 |
| --- | --- |
| 旧 Bot 模型修复 | `group/never-stuck` 自动迁移至 `group/glm-5.3-flash`，保留 `max` |
| 官方模型参考 | 路由组及三个 GLM 单模型入口均保存为 `zai/glm-5.3-flash` |
| 路由组真实对话 | 回复 `MAGPIE_DUCORO_031_OK`；HTTP 200，`max`，15,129 ms |
| 切换为单模型 | 选择 `newapi/glm-5.3-flash` 后，连接默认模型及 Bot 自动跟随 |
| 单模型真实对话 | 回复 `MAGPIE_DUCORO_031_SINGLE_OK`；HTTP 200，`max`，17,393 ms |
| 恢复原路由组 | 连接和 Bot 均恢复 `group/glm-5.3-flash`，保留 `max` |
| 连接探测 | 初次接入、单模型切换、恢复路由组，三次均 HTTP 200 |
| 最终状态 | `tested: ok`，能力报告 `applied: true`，无进行中的 Chief 测试运行 |
| Kimi 未知版本 | `kimi/k3.1-pro` 无对应官方目录条目，报告 `no-official-match`，未强行映射到 K3 |

两次实际对话均由 `newapi` 渠道返回 `glm-5.3-flash`。测试提示仅要求回复固定标记，
未要求模型调用工具或修改文件。

可在 Ducoro 的设备 Chief 对话中查看测试请求和回复。请求 ID：

- `magpie-ducoro-031-live-20261106-1002`，运行 `chief-run-6b86b273ff34fce19d6b804e`。
- `magpie-ducoro-031-single-20261106-1004`，运行 `chief-run-4e07408562bedb8b60ce05c1`。

诊断报告：`~/.config/magpie/ducoro-bridge/model-capabilities.json`。
路由证据：`~/.config/magpie/routing/2026-11-06.jsonl`，10:01–10:05 的 Ducoro 请求。

测试后保留 0.3.1 插件启用，并恢复原有 GLM 路由组选择。路由组成员和路由策略未作
更改；未创建额外模型账户或提供商。相关配置在安装前已备份至权限受限的本机临时目录。

本次实机覆盖 GLM 路由组、GLM 单模型、旧 Bot 迁移和官方能力参考保存。
混合组、多组、故障重试等边界场景由此前 57 项隔离测试覆盖，本次未通过修改用户的
真实路由组再次构造。浏览器窗口存在并发切换，因此最终能力参考和对话结果以官方 CLI
及持久化记录核验，未宣称完成下拉框最终显示的视觉确认。
