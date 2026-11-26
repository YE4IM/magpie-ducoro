Find which Bots use a resource, compare two Bots, and verify a shared plan on one Bot before rolling it out.

## Added

- Find which Bots receive a skill or library connector, where the assignment comes from, and its latest read-back result.
- Compare two Bots across model routes, resource assignments, account tool permissions, and verification, with links to the corresponding settings.
- Try a shared plan with one Bot. The trial persists across automated syncs and host restarts. Verify it before rolling it out or restoring the previous plan.

## Changed

- Show why a resource will be removed when assignments, switches, library entries, or export files change. Flag first-time gateway connection creation in the preview.
- Poll the task center less frequently while idle and refresh immediately when returning to the page or retrying sync.

## Fixed

- Accept null resource lists in Magpie exports and preserve managed connector records when the MCP export is unreadable.
- Keep instruction previews, writes, and read-back verification consistent when Ducoro normalizes blank lines around a managed instruction block.
- Check the configured gateway route during read-back and verify skill contents and file modes from a single scan.

## Maintenance & Dependencies

- Use the package version in the plugin page and diagnostics, and check versioned installation examples before packaging.

## Installation & Upgrade

Stop the current plugin host before upgrading. Enter the reference below in **Plugins → Add a plugin**, then open **Ducoro** in the Magpie sidebar. You can also extract this release’s source archive and register the folder by absolute path.

```text
github:YE4IM/magpie-ducoro#v0.4.11
```

Plugin registration, upgrade, and end-to-end sync were unverified during this documentation update.

## Full Changelog

- [Full Changelog](https://github.com/YE4IM/magpie-ducoro/compare/v0.4.10...v0.4.11)

---

可按资源反查使用它的 Bot、对比两个 Bot，并在推广共享方案前先用一个 Bot 核验效果。

## 新增功能

- 从技能或资源库连接器反查接收它的 Bot，并查看分配来源和最近一次读回核验结果。
- 对比两个 Bot 的模型路由、资源分配、账户工具权限和核验结果，并从差异项打开对应设置。
- 让一个 Bot 试用共享方案。试用状态会跨自动同步和宿主重启保留，可核验后推广或恢复原方案。

## 行为变更

- 分配、开关、资源库条目或导出文件变化时，预览会说明资源撤销原因，并标出首次创建网关连接的操作。
- 任务中心在空闲时逐步降低轮询频率，切回页面或重试同步时立即刷新。

## 问题修复

- 兼容 Magpie 导出中以 null 表示的空资源列表，并在 MCP 导出不可读时保留托管连接器记录。
- Ducoro 规范化托管指令区块外侧空行时，保持指令预览、写入和读回核验一致。
- 读回时核对配置的网关路由，并通过一次扫描核验技能内容和文件权限。

## 维护与依赖更新

- 插件页面和诊断统一读取包版本，打包前检查安装示例中的版本号。

## 安装与升级

升级前停止当前插件宿主。在 Magpie 的「插件 → 添加插件」输入下列引用，然后打开侧边栏的「Ducoro」。也可下载本页的源码归档，解压后登记目录的绝对路径。

```text
github:YE4IM/magpie-ducoro#v0.4.11
```

本次文档整理期间未运行插件注册、升级和端到端同步。

## 完整变更日志

- [完整变更日志](https://github.com/YE4IM/magpie-ducoro/compare/v0.4.10...v0.4.11)
