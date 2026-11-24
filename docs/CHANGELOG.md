# Changelog / 变更日志

[Latest release notes / 最新发布说明](./RELEASE-NOTES.md)

## [v0.4.10] - 2026-11-17

The bilingual installation guide walks through plugin registration in Magpie and verification of the first sync.

中英文安装指南补充了 Magpie 插件注册和首次同步核验步骤。

### Maintenance & Dependencies / 维护与依赖更新

- Document the Magpie page-service and Ducoro CLI requirements, preview and save, and read-only diagnostics.

  补充 Magpie 页面服务、Ducoro CLI、预览保存和只读诊断的使用说明。

- Update the version shown on the plugin page and in diagnostic reports.

  更新插件页面和诊断报告显示的版本号。

## [v0.4.9] - 2026-11-16

This npm release fixes the command used to open the diagnostics report.

此次 npm 发布修复了诊断报告命令的入口。

### Fixed / 问题修复

- Correct the packaged `bin` path so npm installations expose `magpie-ducoro-status`.

  修正 npm 包的 `bin` 路径，使安装后可以调用 `magpie-ducoro-status`。

## [v0.4.8] - 2026-11-16

First-time setup can create a missing Ducoro connection. Preview, sync, and verification now agree on which resources are assigned.

首次设置时可创建缺失的 Ducoro 连接。预览、同步和核验使用一致的资源分配结果。

### Changed / 优化与改进

- Apply the same resource selection rules in preview, sync, and verification.

  预览、同步和核验共用资源选择规则。

- Bound shared skill scans by time, depth, and size, and allow cancellation during reads.

  为共享技能扫描增加时间、深度和规模限制，并支持取消读取。

### Fixed / 问题修复

- Treat an explicit CLI JSON `null` as a missing connection and omit empty capability references when creating it. Updates can still clear old references.

  将 CLI 返回的显式 JSON `null` 识别为连接缺失，创建时省略空能力参考。更新时仍可清除旧参考。

- Preview revocation when an exported connector is disabled, and show content changes only for resources that remain assigned.

  导出的连接器被禁用时预览撤销，只对仍保留分配的资源显示内容变化。

### Maintenance & Dependencies / 维护与依赖更新

- Publish this version to npm as `magpie-ducoro`.

  以 `magpie-ducoro` 为包名将此版本发布到 npm。

## [v0.4.7] - 2026-11-13

Grouped settings and expandable Bot resource editors make assignments easier to review. The interface follows Magpie's language and preserves drafts and focus during a language change.

同步设置分组展示，Bot 资源可按需展开编辑。界面跟随 Magpie 语言，切换时保留草稿和焦点。

### Changed / 优化与改进

- Group sync settings and align model, connector, and skill editors. Show the target range when reviewing a plan.

  对同步设置分组，对齐模型、连接器和技能编辑区，并在查看方案时展示目标范围。

- Improve keyboard access, status messages, dates, and accessible labels in both languages.

  改善中英文键盘操作、状态提示、日期和无障碍标签。

### Fixed / 问题修复

- Center save-bar status text and remove spacing for empty draft notices.

  修正保存栏状态文字的垂直对齐，并移除空草稿提示的占位。

- The 2026-11-14 follow-up preserves plan draft modes, discards stale preview results, and recovers draft locks held by exited processes. It also preserves the existing sync state when a restore fails its preflight check.

  2026-11-14 的后续修复保留方案草稿的选择模式，丢弃过期预览结果，并恢复已退出进程遗留的草稿锁。恢复预检失败时也会保留原有同步状态。

## [v0.4.6] - 2026-11-13

Plan changes participate in the preview and save flow. Resuming synchronization after a management-record restore requires a separate review.

方案修改纳入预览和保存流程。恢复管理记录后，需要单独预览影响并确认继续同步。

### Changed / 优化与改进

- Reorganize Bot resources and improve search, focus, and backup summaries.

  重排 Bot 资源页面，改进搜索、焦点管理和备份摘要。

- Require a fresh preview before explicitly resuming synchronization after restoring management records.

  恢复管理记录后，先重新预览影响，再明确继续同步。

### Fixed / 问题修复

- Include plan edits when saving and checking unsaved changes. Correct preview failures, global change counts, and initial verification status.

  保存及检查未保存改动时纳入方案编辑，并修正预览失败提示、全局变化计数和首次核验状态。

## [v0.4.5] - 2026-11-11

Previews show what was last synced, what Ducoro currently has, and what Magpie will apply. Drafts survive reloads, and interrupted writes are checked against actual state before recording plugin ownership.

预览可对照上次同步、Ducoro 当前和 Magpie 期望配置。重新打开页面可以恢复草稿，写入中断后会先核对实际结果再记录托管归属。

### Added / 新增功能

- Use the task center to retry, pause, or resume individual operations. Temporary failures retry with backoff.

  在任务中心重试、暂停或恢复单项操作。临时失败会按退避间隔自动重试。

- Name, annotate, retain, and export backups. Selective rollback includes related plans, inheritance, and scope changes.

  为备份添加名称、备注和保留标记，或导出备份。选择性回退会带上关联方案、继承关系和作用域变化。

- Undo the latest bulk assignment. Copies use the source Bot's effective configuration, including inherited settings.

  支持撤销最近一次批量分配。复制使用来源 Bot 的有效配置，包括继承值。

### Changed / 优化与改进

- Show whether each previewed value comes from global settings, an inherited plan, or a Bot override, and list managed blocks and files scheduled for removal.

  显示预览值来自全局设置、继承方案还是 Bot 覆盖，并列出将撤销的托管区块和文件。

- Autosave settings and plan drafts and detect concurrent page edits before overwriting.

  自动保存设置和方案草稿，并在覆盖前检查多页面编辑冲突。

- Track saved, written, read-back, and session-loaded stages. Continue verification in the background after 35 seconds and reconnect when the page reopens.

  分别跟踪已保存、已写入、已读回和会话加载。超过 35 秒后转入后台核验，重新打开页面时接续。

- Record intent before creating connectors or skills. After an interrupted write, read back identity and content before confirming ownership.

  创建连接器或技能前登记意图。写入中断后，读回身份和内容再确认托管归属。

- Pause automatic synchronization after restoring management records until the user reviews the impact and resumes it.

  恢复管理记录后暂停自动同步，等用户预览影响并确认继续。

- Reduce repeated skill preparation and journal writes. On timeout or cancellation, close the command process tree and reconcile uncertain writes.

  减少重复技能准备和日志写入。超时或取消时收尾整棵命令进程树，再核对结果不确定的写入。

### Fixed / 问题修复

- Preserve existing skills when selected sources share a manifest name, and preserve instructions when exported instructions are missing or incomplete.

  选中的技能源具有相同清单名称时保留现有技能，指令导出缺失或不完整时保留现有指令。

- Report stale or missing subagent files against the current desired content. Prevent an invalid resource library from revoking existing assignments.

  按当前期望内容核验陈旧或缺失的子代理文件。资源库无效时保留已有分配。

- Use cross-platform path checks for skill reading, staging, and watching. Enable backup downloads from the plugin page.

  技能读取、暂存和监听采用跨平台路径判断，并修复插件页面中的备份下载。

- Report a conflict when the CLI cannot safely clear connector arguments or change transport. Store comma-containing connector credentials through references.

  CLI 无法安全清空连接器参数或切换传输方式时报告冲突，含逗号的连接器凭据通过引用保存。

## [v0.4.4] - 2026-11-16

Connector previews avoid false updates, and instruction and subagent targets match those used by sync.

连接器预览修正了误报，指令和子代理的预览目标与实际同步一致。

### Changed / 优化与改进

- Reuse inventory for the immediate automatic comparison. Manual and pre-save previews reread it. Run healthy full scans every five minutes while retaining faster polling in degraded mode.

  即时自动对比复用本轮清单，手动预览和保存前预览重新读取。状态正常时每五分钟完整扫描一次，降级时保持快速轮询。

- Validate recovery-operation timestamps, revision hashes, attempt counts, and dependencies before importing backups.

  导入备份前校验恢复操作的时间、版本摘要、尝试次数和依赖字段。

### Fixed / 问题修复

- Preserve plan target selections across list refreshes and language changes.

  刷新列表或切换语言后保留方案编辑中的目标 Bot 勾选。

- Skip operation-log writes for verified, unchanged resources while retaining retries for missing or failed resources.

  已核验且未变化的资源跳过操作日志写入，缺失或失败的资源仍可重试。

## [v0.4.3] - 2026-11-08

Manage backups and configuration checkpoints in one place. Multi-Bot synchronization shares skill artifacts and repeated reads.

集中管理备份和配置检查点。多 Bot 同步可复用技能产物并合并重复读取。

### Added / 新增功能

- Import external backups, preview restores, selectively roll back configuration, and preview local-record cleanup.

  导入外部备份、预览恢复、选择性回退配置，以及预览本地记录清理。

### Changed / 优化与改进

- Save management changes in an incremental journal and reconcile interrupted operations against actual state before retrying.

  通过增量日志保存管理记录变更，中断后先核对实际状态再重试。

- Improve timeout and cancellation cleanup, output limits, and concurrent inventory reads.

  改进超时与取消后的收尾、命令输出上限及并发清单读取。

- Preserve ownership, original permission data, unfinished operations, and in-use skills during local cleanup.

  清理本地记录时保留托管归属、原始权限、未完成操作和使用中的技能。

### Fixed / 问题修复

- Preserve previous diagnostics and outstanding issues for resources outside the current incremental sync.

  增量同步时保留本轮范围以外资源的诊断结果和待处理项。

## [v0.4.2] - 2026-11-07

Bots can continuously inherit shared plans and keep individual overrides. Incremental sync and item-level verification reduce repeated work and show the result of each change.

多个 Bot 可以持续继承共享方案并保留单项覆盖。增量同步减少重复处理，逐项核验展示每项变更的结果。

### Added / 新增功能

- Add sync progress and timings, model drift detection, item-level readback, and selective configuration rollback.

  新增同步步骤和耗时、模型漂移检测、逐项读回及选择性配置回退。

- Add Bot search, pending-change counts, bulk assignment copy, and backup preview and deletion.

  新增 Bot 搜索、待保存计数、批量复制分配，以及备份预览和单份删除。

### Changed / 优化与改进

- Reuse cached skill content, merge concurrent reads, and verify model changes concurrently.

  复用技能缓存，合并并发读取，并发核验模型变更。

- Localize dynamic statuses, errors, and verification results. Add `--lang en|zh` to the diagnostics CLI.

  翻译动态状态、错误和核验结果，为诊断命令增加 `--lang en|zh`。

### Fixed / 问题修复

- Check for model drift before resuming management through a rollback, expanding targets, or re-enabling connection sync.

  回退后恢复模型管理、扩大目标范围或重新启用连接同步时，先检查模型漂移。

- Report missing instructions on a first write and mark unreadable target directories as unverified.

  报告首次写入失败导致的指令缺失，并将不可读的目标目录标为待核实。

## [v0.4.1] - 2026-11-07

Settings become editable as they load, and multi-Bot previews handle slow or cancelled reads more reliably.

设置加载后即可编辑，多 Bot 预览改善了慢请求和取消请求的处理。

### Changed / 优化与改进

- Load settings, resources, and catalogs independently. Limit concurrent permission reads and stop related reads when the preview is cancelled.

  独立加载设置、资源和目录。限制权限读取并发量，预览取消时停止相关读取。

- Confirm before discarding drafts, keep previous diagnostics visible during refresh, and make save feedback reflect actual sync status.

  放弃草稿前请求确认，刷新诊断时保留上一份结果，并按实际同步状态反馈保存结果。

### Fixed / 问题修复

- Prevent stale responses from replacing drafts and align the three resource controls on narrow layouts.

  防止过期响应覆盖草稿，并修复窄屏布局中的三列资源控件对齐。

## [v0.4.0] - 2026-11-07

Preview changes by Bot and compare the desired Magpie settings with the current Ducoro configuration before saving.

保存前按 Bot 预览变更，对照 Magpie 期望和 Ducoro 当前配置。

### Added / 新增功能

- Preview global-to-per-Bot resource moves, model assignments, and account permissions before confirming a save.

  确认保存前预览全局资源转为按 Bot 分配的影响，以及模型和账户权限变更。

- Resolve account permission conflicts by keeping the Ducoro policy or reapplying Magpie settings. Recheck the reviewed policy before writing.

  账户权限冲突可选择保留 Ducoro 策略或重新应用 Magpie 设置，写入前重新检查已核对的权限。

### Changed / 优化与改进

- Check feature capabilities independently, prioritize account revocations, and preserve recovery records for uncertain writes.

  分项检测功能能力，优先执行账户撤销，并为结果不确定的写入保留恢复记录。

- Pause sync when management records cannot be read and back off watch recovery when source files are unchanged.

  管理记录不可读时暂停同步，源文件无变化时延长监听恢复间隔。

- Localize previews, errors, account controls, and recovery guidance while preserving drafts on language changes.

  翻译预览、错误、账户控件和恢复指引，切换语言时保留草稿。

### Fixed / 问题修复

- Distinguish empty exports, disconnected sources, and unreadable exports when reporting skill and model sync status.

  报告技能和模型同步状态时区分有效空导出、连接断开和导出不可读。

## [v0.3.5] - 2026-11-06

A side drawer groups account connector settings, and the Ducoro model catalog can be refreshed and searched.

账户连接器改用侧边抽屉管理，Ducoro 模型目录支持刷新和搜索。

### Changed / 优化与改进

- Edit assignment mode, account, and tool permissions together. Closing the drawer preserves the draft.

  在同一处编辑分配方式、账户和工具权限，关闭抽屉时保留草稿。

- Refresh the Ducoro catalog on demand and keep the last usable catalog if the refresh fails. Match full model IDs for newly listed model families.

  按需刷新 Ducoro 目录，刷新失败时保留上一次有效目录，并支持匹配新增系列的完整模型 ID。

- Follow Magpie's language automatically and preserve drafts during language changes. Diagnostics default to English.

  自动跟随 Magpie 语言，切换时保留草稿。诊断命令默认使用英文。

## [v0.3.4] - 2026-11-06

A visual settings page brings together models, connectors, and skills. Diagnostics now come directly from the live service.

可视化设置页面集中管理模型、连接器和技能，诊断结果改为从实时服务获取。

### Added / 新增功能

- Follow the default model or pin a model for a Bot. Assign library connectors, skills, and permitted account tools from the plugin page.

  可跟随默认模型或为 Bot 固定模型，在插件页面分配资源库连接器、技能和允许使用的账户工具。

- Request a live diagnostics report or retry synchronization from the page. Reports distinguish the viewing time from the last synchronization time.

  可在页面查看实时报告或请求重试同步。报告分别显示查看时间和最近同步时间。

### Fixed / 问题修复

- Reconnect the page service after a plugin reload and allow Magpie desktop page origins.

  插件重载后重新连接页面服务，并允许 Magpie 桌面端页面来源。

### Deprecated & Removed / 弃用与移除

- Replace saved report files and snapshot import with on-demand diagnostics in the page and CLI.

  页面和命令行改为按需生成诊断，移除报告文件和快照导入入口。

## [v0.3.2] - 2026-11-06

A visual console exposes synchronization settings and per-Bot resource assignments.

可视化控制台提供同步设置和按 Bot 分配资源的入口。

### Added / 新增功能

- Configure target Bots and model capability mappings. Assign MCP connectors and skills by Bot with inheritance or explicit empty lists.

  配置目标 Bot 和模型能力映射，按 Bot 分配 MCP 连接器与技能，并支持继承和显式空清单。

- Inspect unified diagnostics from a read-only CLI or import a report snapshot into the console.

  使用只读诊断命令检查统一报告，或将报告快照导入控制台。

### Changed / 优化与改进

- Validate assignment scopes and resource lists before sync, and migrate older global management records when changing scope.

  同步前校验分配作用域和资源清单，切换作用域时迁移旧版全局管理记录。

## [v0.3.1] - 2026-11-06

Magpie models and route groups can sync automatically, and Ducoro can use official catalog entries as capability references.

Magpie 模型和路由组支持自动同步，Ducoro 可使用官方目录条目作为能力参考。

### Added / 新增功能

- Follow the Magpie default model for associated Bots, repair stale model IDs, and preserve supported thinking levels.

  关联 Bot 跟随 Magpie 默认模型，修复失效的模型 ID，并保留受支持的思考档位。

- Match individual models and route groups against the official catalog. Show candidates and capability differences for uncertain matches, and allow manual overrides or disabling references.

  将单模型和路由组与官方目录匹配，匹配不确定时给出候选及能力差异，并支持手动覆盖或禁用参考。

- Watch route-group membership changes and retry or recover synchronization after failure or restart.

  监听路由组成员变化，支持失败重试及重启后恢复同步。

## [v0.3.0] - 2026-11-05

The first tagged version adds Ducoro as a Magpie plugin agent and syncs assigned resources through `ducoro-cli`.

首个 Git 标签版本将 Ducoro 接入 Magpie 的插件 Agent，并通过 `ducoro-cli` 同步已分配的资源。

### Added / 新增功能

- Connect Ducoro to Magpie models and synchronize assigned MCP connectors, skills, instructions, and explicitly selected subagents.

  让 Ducoro 使用 Magpie 模型，同步已分配的 MCP 连接器、技能、指令及显式选定的子代理。
