# Ducoro 0.4.8

0.4.8 统一了预览、实际同步与核验的资源规则，修复导出配置禁用连接器时撤销漏报，以及同一技能同时显示“撤销”和“更新”的问题。技能扫描支持取消与总时限，并限制目录数量、深度和内容规模；中断后通过读回核验恢复管理记录，避免重复创建或接管被外部修改的资源。完整支持中英文切换，保留草稿、选择、焦点和打开的弹窗。升级沿用现有兼容设置与管理记录，无需重新配置。

Version 0.4.8 shares resource rules across previews, synchronization and verification, fixing missing connector revocations when an exported definition is disabled and skills incorrectly shown as both removed and updated. Skill scanning supports cancellation and deadlines with directory, depth and size limits. Readback after an interruption restores management records without duplicating resources or taking over externally modified content. English and Chinese language switching preserves drafts, selections, focus and open dialogs. Compatible settings and management records carry forward without reconfiguration.

完整更新说明见 [RELEASE-NOTES.md](RELEASE-NOTES.md) · Full notes: [CHANGELOG.md](CHANGELOG.md) · [中文使用说明](README.zh-CN.md)

## 安装 / Installation

在 Magpie 的插件页面添加下面的地址，或执行命令。也可在 [GitHub Release](https://github.com/YE4IM/magpie-ducoro-plugin/releases/tag/v0.4.8) 下载自动生成的 **Source code**，解压后添加文件夹路径。需要本机已安装 `ducoro-cli`，并启动 Ducoro 后台。

Add the following address in Magpie's Plugins page, or run the command below. You can also download GitHub's automatically generated **Source code** from the release, extract it and add the folder path. Install `ducoro-cli` locally and start the Ducoro daemon first.

```sh
magpie plugin add github:YE4IM/magpie-ducoro-plugin#v0.4.8
```

## 连接与数据 / Connection and data

插件把 Magpie 中已配置的模型网关与分配给 Ducoro 的连接器、技能和指令同步到 Ducoro，不提供独立账号登录。Ducoro 账户连接器需先在 Ducoro 中连接，再按 Bot 配备工具；模型范围沿用 Magpie 可用的模型。Magpie 管理自己的登录信息；Ducoro 管理账户授权及加密凭据。插件的管理记录、草稿和备份默认位于 `~/.config/magpie/ducoro-bridge/`，模型与资源导出位于 `~/.ducoro/` 下的 `magpie-*` 文件或目录。不要将含有网关密钥的导出文件提交到仓库。

The plugin syncs Magpie's configured model gateway and the connectors, skills and instructions assigned to Ducoro; it does not provide a separate account sign-in. Connect account services in Ducoro before assigning their tools to Bots. Models come from Magpie's available catalog. Magpie manages its sign-in information, while Ducoro manages account authorization and encrypted credentials. Management records, drafts and backups default to `~/.config/magpie/ducoro-bridge/`; model and resource exports use `magpie-*` files or directories under `~/.ducoro/`. Keep exports containing gateway keys out of version control.

MIT · [Magpie 插件开发手册 / Plugin development guide](https://usemagpie.ai/docs/zh/plugins#publish)
