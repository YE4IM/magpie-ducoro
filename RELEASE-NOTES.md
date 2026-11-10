# Ducoro 0.4.5

## 中文

0.4.5 聚焦同步效率、编辑保护与异常恢复。新版减少重复读取、无变化日志写入和多 Bot 刷新开销，修复预览误报与冷启动问题，并统一指令、子代理的预览与实际同步目标。方案草稿支持完整自动保存、多页面防覆盖和批量修改撤销，失败操作可按 Bot、按资源重试、暂停或恢复。同步锁诊断、内容摘要与权限核验让问题更易定位；备份新增名称、备注、保留和导出，选择性回退自动关联配置依赖，同时完善备份导入校验与 MCP 更新兼容性。中英文界面保留草稿与选择状态，升级沿用现有设置和管理记录，无需重新配置。

## English

0.4.5 improves sync efficiency, protects unfinished edits and strengthens recovery. It reduces repeated reads, unnecessary journal writes and multi-Bot refresh overhead, fixes misleading previews and cold-start failures, and aligns instruction and subagent previews with actual synchronization. Complete plan drafts save automatically, with protection against conflicting edits across pages and undo for bulk changes. Individual Bot resources can be retried, paused or resumed, supported by clearer lock diagnostics, content digests and permission verification. Backups gain names, notes, retention and export, while selective rollback includes related configuration dependencies. Backup import validation and MCP update compatibility are also improved. Chinese and English interfaces preserve drafts and selections, and existing settings and management records carry forward without reconfiguration.
