# Ducoro 0.4.8

修复首次安装的两处连接阻塞：兼容 CLI 对不存在连接返回的 JSON `null`；创建时省略空能力映射参数，更新时仍可清空旧映射。空输出与损坏响应仍会阻止写入。

Fix two first-install connection blockers: accept the CLI’s explicit JSON `null` for an absent connection and omit empty capability references on creation, while preserving clearing on updates. Empty or malformed responses still prevent writes.

0.4.8 统一了预览、实际同步与核验的资源规则，修复导出配置禁用连接器时撤销漏报，以及同一技能同时显示“撤销”和“更新”的问题。技能扫描支持取消与总时限，并限制目录数量、深度和内容规模；中断后通过读回核验恢复管理记录，避免重复创建或接管被外部修改的资源。完整支持中英文切换，保留草稿、选择、焦点和打开的弹窗。升级沿用现有兼容设置与管理记录，无需重新配置。

Version 0.4.8 shares resource rules across previews, synchronization and verification, fixing missing connector revocations when an exported definition is disabled and skills incorrectly shown as both removed and updated. Skill scanning supports cancellation and deadlines with directory, depth and size limits. Readback after an interruption restores management records without duplicating resources or taking over externally modified content. English and Chinese language switching preserves drafts, selections, focus and open dialogs. Compatible settings and management records carry forward without reconfiguration.

发布目录已清理测试、QA、开发记录及旧打包产物，保留运行文件、界面资源、必要文档和恢复命令。GitHub Release 仅提供自动生成的 Source code，不上传额外附件。

The release tree contains runtime files, UI assets, essential documentation and recovery commands, with tests, QA output, development records and old packages removed. GitHub Release provides only its automatically generated Source code, with no uploaded assets.

完整更新说明见 [CHANGELOG.md](CHANGELOG.md) · Full history: [CHANGELOG.md](CHANGELOG.md)
