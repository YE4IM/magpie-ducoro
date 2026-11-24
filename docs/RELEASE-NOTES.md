The bilingual installation guide now starts with plugin registration in Magpie and walks through the first sync, from previewing changes to checking the result.

## Maintenance & Dependencies

- Clarify Magpie page-service support, the Ducoro background service and CLI requirements, and which compatibility checks were performed.
- Explain how to check saved, written, read-back, and session-loaded results and run a read-only diagnostic.
- Update the version shown on the plugin page and in diagnostic reports.

## Installation & Upgrade

In Magpie, open **Plugins → Add a plugin** and enter `magpie-ducoro@0.4.10`, or use the Magpie CLI.

```bash
magpie plugin add magpie-ducoro@0.4.10
```

Magpie's CLI help confirms the registration command. Registration and first sync were unverified in the documentation check because they require a configured Magpie and Ducoro installation.

Before upgrading, stop the previous plugin host, then update the package or replace the configured plugin path. The new version can use existing settings and compatible v1/v2 management records.

## Full Changelog

- [Full Changelog](https://github.com/YE4IM/magpie-ducoro/compare/v0.4.9...v0.4.10)

---

中英文安装指南从在 Magpie 中注册插件讲起，并说明首次同步时如何预览变更、保存和核验结果。

## 维护与依赖更新

- 明确 Magpie 页面服务、Ducoro 后台服务和 CLI 要求，并说明已验证的兼容性范围。
- 说明如何检查已保存、已写入、已读回和会话加载状态，以及如何运行只读诊断。
- 更新插件页面和诊断报告显示的版本号。

## 安装与升级

在 Magpie 中打开「插件 → 添加插件」，输入 `magpie-ducoro@0.4.10`，也可以使用 Magpie 命令行。

```bash
magpie plugin add magpie-ducoro@0.4.10
```

已在 Magpie 命令行帮助中确认注册命令。注册和首次同步需要已配置的 Magpie 与 Ducoro 环境，本次文档检查未验证这两项操作。

升级前先停止旧版插件宿主，再更新包版本或替换配置中的插件路径。新版可继续使用现有设置和兼容的 v1/v2 管理记录。

## 完整变更日志

- [完整变更日志](https://github.com/YE4IM/magpie-ducoro/compare/v0.4.9...v0.4.10)
