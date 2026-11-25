Trace resource assignments, compare two Bots, and try a shared plan on one Bot before rolling it out. Sync previews now show why resources will be removed and when the first gateway connection will be created.

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

Stop the previous plugin host before upgrading. Add the GitHub ref in Magpie or extract the source archive and register the extracted folder by absolute path. GitHub provides the ZIP and tar.gz source archives under Assets. [GitHub Release](https://github.com/YE4IM/magpie-ducoro/releases/tag/v0.4.11)

```bash
magpie plugin add github:YE4IM/magpie-ducoro#v0.4.11
```

Installation and end-to-end sync in a configured Magpie and Ducoro environment were unverified for this release.

## Full Changelog

- [Full Changelog](https://github.com/YE4IM/magpie-ducoro/compare/v0.4.10...v0.4.11)

---

可反查资源分配、对比两个 Bot，并在推广共享方案前先让一个 Bot 试用。同步预览会说明资源撤销原因，并标出首次创建网关连接的操作。

## 新增功能

- 从技能或资源库连接器反查接收它的 Bot，并查看分配来源和最近一次读回核验结果。
- 对比两个 Bot 的模型路由、资源分配、账户工具权限和核验结果，并从差异项打开对应设置。
- 让一个 Bot 试用共享方案。试用状态会跨自动同步和宿主重启保留，可核验后推广或恢复原方案。

## 优化与改进

- 分配、开关、资源库条目或导出文件变化时，预览会说明资源撤销原因，并标出首次创建网关连接的操作。
- 任务中心在空闲时逐步降低轮询频率，切回页面或重试同步时立即刷新。

## 问题修复

- 兼容 Magpie 导出中以 null 表示的空资源列表，并在 MCP 导出不可读时保留托管连接器记录。
- Ducoro 规范化托管指令区块外侧空行时，保持指令预览、写入和读回核验一致。
- 读回时核对配置的网关路由，并通过一次扫描核验技能内容和文件权限。

## 维护与依赖更新

- 插件页面和诊断统一读取包版本，打包前检查安装示例中的版本号。

## 安装与升级

升级前先停止旧版插件宿主。在 Magpie 中添加 GitHub 引用，也可下载并解压源码，再通过文件夹绝对路径注册。GitHub 在 Assets 中提供 ZIP 和 tar.gz 源码归档。[GitHub Release](https://github.com/YE4IM/magpie-ducoro/releases/tag/v0.4.11)

```bash
magpie plugin add github:YE4IM/magpie-ducoro#v0.4.11
```

本次发布未在已配置的 Magpie 和 Ducoro 环境中验证安装及端到端同步。

## 完整变更日志

- [完整变更日志](https://github.com/YE4IM/magpie-ducoro/compare/v0.4.10...v0.4.11)
