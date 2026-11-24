# magpie-ducoro v0.4.10

**Release date / 发布日期:** 2026-11-17 (UTC+8) · **Type / 类型:** Stable / 正式版

[English](#english) | [中文](#中文)

## English

This release makes it easier to install `magpie-ducoro` and verify your first sync. The English and Chinese guides now lead with Magpie plugin registration and explain how to preview, save, and check the result.

### Maintenance & Documentation

- The installation guide clarifies Magpie page-service support, the `ducoro-cli` and background-service requirements, and the limits of compatibility testing.
- The first-use guide walks through previewing and saving changes, then checking sync status and running a read-only diagnostic.
- The plugin page and diagnostic reports display version `0.4.10`.

### Installation & Upgrade

In Magpie, open **Plugins → Add a plugin** and enter `magpie-ducoro@0.4.10`, or run:

```bash
magpie plugin add magpie-ducoro@0.4.10
```

If you downloaded the [npm package](https://www.npmjs.com/package/magpie-ducoro/v/0.4.10) with `npm install`, use either Magpie entry point above to register it. The command appears in Magpie’s CLI help. Plugin registration has yet to be tested in this environment.

Before upgrading, stop the previous plugin host, then update the package or replace the configured plugin path before loading the new version. Existing settings and compatible v1/v2 management records carry forward.

### Full Changelog

- [Compare v0.4.9...v0.4.10](https://github.com/YE4IM/magpie-ducoro/compare/v0.4.9...v0.4.10)
- [Version history](https://github.com/YE4IM/magpie-ducoro/blob/v0.4.10/docs/CHANGELOG.md)

---

## 中文

这个版本让 `magpie-ducoro` 的安装和首次同步更容易上手。中英文指南把 Magpie 插件注册步骤提前，并说明如何预览、保存和核验同步结果。

### 维护与文档

- 安装指南明确了 Magpie 页面服务、`ducoro-cli` 和后台服务要求，以及兼容性验证的范围。
- 首次使用指南说明如何预览并保存变更、查看同步状态，以及运行只读诊断。
- 插件页面和诊断报告显示版本 `0.4.10`。

### 安装与升级

在 Magpie 的「插件 → 添加插件」中输入 `magpie-ducoro@0.4.10`，或运行：

```bash
magpie plugin add magpie-ducoro@0.4.10
```

如果已通过 `npm install` 下载 [npm 包](https://www.npmjs.com/package/magpie-ducoro/v/0.4.10)，请用上述任一 Magpie 入口完成注册。Magpie 的命令行帮助列出了该命令。本环境尚未验证插件注册结果。

升级时先停止旧版插件宿主，再更新包版本或替换配置中的插件路径，然后加载新版。已有设置及兼容的 v1/v2 管理记录可继续使用。

### 完整变更日志

- [对比 v0.4.9...v0.4.10](https://github.com/YE4IM/magpie-ducoro/compare/v0.4.9...v0.4.10)
- [版本历史](https://github.com/YE4IM/magpie-ducoro/blob/v0.4.10/docs/CHANGELOG.md)
