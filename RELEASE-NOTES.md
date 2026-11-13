# 0.4.6 中文开发说明

本版本在独立目录开发，未替换当前运行的 0.4.5。28 项审查问题的修复与验证范围见 [开发与验收记录](DEVELOPMENT-0.4.6.zh-CN.md)。

主要变化：统一方案保存流程；恢复后持续暂停并要求预览后明确继续；准确区分变化与未知；Bot 列表优先；精简保存栏；资源搜索；备份摘要；主题与键盘操作一致性。

本阶段固定中文，保留已有英文资源，新增英文开发等待通知。

---

# Ducoro 0.4.5 升级日志 / Release Notes

发布日期 / Released: 2026-11-12

## 中文

0.4.5 重做同步链路的可靠性与编辑保护：首次创建与接管连接先登记意图、读回核对后再确认归属；失败按原因分类并自动退避重试；方案草稿完整自动保存并防止多页面覆盖；指令与技能不再因导出缺失或来源歧义被误改。预览补齐“上次同步 · 当前 · 期望”三方对照与配置来源，任务中心集中提供重试、暂停和恢复，核验超时后转入后台继续跟踪。备份新增名称、备注、保留和导出，恢复管理记录后同步暂停等待人工确认。升级沿用现有设置与管理记录，无需重新配置。

### 同步与对账

- 复用相同内容的技能产物，合并多 Bot 与多轮同步中的重复读取；无变化时不再重复追加管理记录日志，账户权限预览只读取有期望分配或已有管理归属的 Bot。
- 首次创建 MCP 连接器或技能前先写入恢复意图：响应丢失后，只有身份与完整内容读回一致才恢复管理归属；接管相同地址的既有连接时，不再误记未实际更新的新密钥。
- 同一目标选中多个 manifest 同名的技能源时保留现有技能并提示处理；指令导出缺失或不完整时保留现有指令并按 Bot 记录阻塞原因。
- 技能读取、暂存与监听统一使用跨平台路径判断，修复硬编码路径分隔符对 Windows 的影响。

### 草稿与编辑保护

- 未提交的设置与方案草稿完整自动保存，退出页面、切换语言或刷新后仍可恢复；批量修改支持一键撤销。
- 草稿使用独立短锁与修订号队列：多页面编辑冲突时提示恢复最新草稿，不再静默覆盖；草稿损坏时保留原文件并给出处理指引。
- 批量复制按来源 Bot 的有效配置（含继承方案）执行；“清除单项覆盖”同时清除指令覆盖，方案切换改用页面内确认弹窗。

### 失败处理与恢复

- 命令按进程组管理：超时、取消与输出超限都会收尾整个进程树，并区分“结果未确认”的情况；中断写入后自动做只读回查，供资源对账使用。
- 失败按临时、权限、冲突、不支持、数据损坏、待核实六类标注：临时失败按退避时间自动重试，其余等待人工处理；任务中心汇总全部任务，支持单项重试、暂停与恢复。
- 恢复管理记录备份后自动暂停同步，需先预览再手动继续，重启宿主不会解除该暂停。

### 预览与核验

- 预览标注每项配置的来源（全局设置、继承方案或单项覆盖），并对照“上次同步 · Ducoro 当前 · Magpie 期望”；切换目标或取消选择时明确列出将撤销的托管区块和文件。
- 核验区分已保存、已写入、已读回、会话生效四个阶段；超过 35 秒转入后台继续跟踪，连接中断自动恢复查询，重新打开页面可接续。
- 子代理核验对照当前期望正文，旧文件不再因匹配旧摘要而误报通过；未安装、待撤销或来源不可读的资源都会给出待核实条目。

### 数据与安全

- 加强资源库结构与规模校验：损坏但语法合法的资源库不再被解释为空选择并触发撤销，深层路由子组不再造成指数级计算。
- 管理记录统一保留键校验并在保存前重放校验，避免写出无法再次读取的增量记录；页面接口统一 JSON 解析、大小限制与错误码。
- 技能包处理增加文件数量与总大小限制；技能工件清理纳入待确认创建的引用，避免误删。
- 包含逗号的连接器凭据自动改写为凭据引用；凭据写入确认后才提交管理摘要，并保留结构化错误。
- 修复 MCP 摘要不一致导致的预览误报；当前 CLI 无法安全清空参数列表或切换 transport 时保留原定义并报告冲突。

### 备份与发布

- 备份支持名称、备注、保留标记和 JSON 导出；修复页面沙箱阻止导出下载的问题；保留项不受自动裁剪、批量清空或本地记录清理影响。
- 选择性配置回退关联方案定义、继承关系和作用域变化，先生成草稿再预览保存。
- 完善中英文状态、错误提示与无障碍标签；发布目录仅保留运行源码与使用文档，移除测试、开发依赖与审查过程文件。

### 升级提示

1. 停止旧版插件宿主后再切换至 0.4.5，避免两个版本同时写入管理记录；已有设置和兼容的 v1/v2 管理记录可继续使用。
2. 恢复管理记录或回退旧版本前停止宿主：恢复后先预览再手动同步；回退前用 `npm run state:compact -- /管理记录的绝对路径/state.json` 合并增量日志，不要直接删除尚未合并的日志。
3. 读回一致不代表运行中会话已加载，请在 Ducoro 的新会话或下一轮对话中确认模型、工具、技能、指令及子代理。
4. 清理发布目录前已完成自动回归与浏览器验证（备份下载、方案确认、批量撤销、草稿恢复等）；清理后通过脚本语法、入口导入和打包一致性检查。真实 Magpie/Ducoro 账户联调与 Windows 实机验证尚未完成。

## English

Version 0.4.5 rebuilds the reliability of the sync pipeline and protects unfinished edits. First-time creations and adopted connections register intent first and are confirmed by reading back actual state; failures are classified by cause with automatic backoff retries; plan drafts autosave completely and are protected across pages; instructions and skills are no longer touched when an export is missing or a source is ambiguous. Previews add three-way comparison of last-synced, current and desired values with configuration sources, a task center centralizes retry, pause and resume, and verification keeps tracking in the background after a timeout. Backups gain names, notes, retention and export, and automatic sync pauses after restoring management records until you confirm. Existing settings and management records carry forward without reconfiguration.

### Sync and reconciliation

- Reuse identical skill artifacts and merge repeated reads across Bots and rounds; unchanged management records no longer append journal entries, and account policies are read during previews only for Bots with desired assignments or existing managed policies.
- Persist recovery intent before creating an MCP connector or skill: after a lost response, ownership is restored only when identity and complete content read back identically. Adopting an existing connection at the same URL no longer records a new key that was never applied.
- When multiple selected skill sources share one manifest name for the same target, existing skills are preserved with guidance; missing or incomplete instruction exports keep current instructions and record the blocking cause per Bot.
- Skill reads, staging and watching use cross-platform path checks, fixing hard-coded path separators on Windows.

### Drafts and edit protection

- Unfinished settings and plan drafts autosave completely and survive page exits, language switches and refreshes; the latest bulk change can be undone in one click.
- Drafts use a dedicated short lock and a revision queue: concurrent edits across pages prompt to restore the latest draft instead of silently overwriting, and a corrupt draft keeps the original file with guidance.
- Bulk copies apply the source Bot’s effective configuration, including inherited plans; clearing overrides also removes instruction overrides, and switching plans uses an in-page confirmation dialog.

### Failure handling and recovery

- Commands run in their own process group: timeouts, cancellation and output limits end the whole tree, and “outcome unknown” is distinguished from plain failure; interrupted mutations are read back before reconciliation.
- Failures are labeled temporary, permission, conflict, unsupported, corrupt or unconfirmed. Temporary failures retry with backoff; the rest wait for manual action. A task center lists every task with per-item retry, pause and resume.
- Restoring a management-record backup pauses automatic sync until previewed and manually continued; restarting the host does not clear the pause.

### Preview and verification

- Previews label each value’s source (global settings, inherited plan or Bot override) and compare last-synced, current Ducoro and desired Magpie values; switching targets or deselecting lists managed blocks and files scheduled for removal.
- Verification distinguishes saved, written, read-back and session-loaded stages, continues in the background beyond 35 seconds, reconnects after interrupted polling and resumes when the page reopens.
- Subagents verify against the current desired content, so old files no longer pass by matching an old digest; missing installations, pending removals and unreadable sources each produce an unverified row.

### Data and safety

- Library structure and size are validated before use: malformed but syntactically valid libraries no longer become an empty selection that revokes managed resources, and deep route-group subgraphs no longer expand exponentially.
- Management records apply consistent reserved-key validation and are replay-validated before saving, preventing unreadable journal entries; the page API unifies JSON parsing, size limits and error codes.
- Skill bundles are bounded by file count and total size; skill artifact cleanup respects pending-creation references to avoid deleting them.
- Connector credentials containing commas are rewritten as credential references; the management digest commits only after the credential write succeeds, and structured errors are preserved.
- Fix misleading MCP previews caused by inconsistent fingerprints; the existing definition is preserved and a conflict reported when the current CLI cannot safely clear parameter lists or change transport.

### Backups and distribution

- Backups support names, notes, retention flags and JSON export; downloads blocked by the page sandbox are fixed; retained backups survive automatic pruning, bulk clearing and local-record cleanup.
- Selective configuration rollback includes related plan definitions, inheritance and scope changes, staging a draft for preview before saving.
- Chinese and English statuses, errors and accessibility labels are refined; the release folder keeps only runtime source and usage documentation, dropping tests, development dependencies and review artifacts.

### Upgrade notes

1. Stop the previous plugin host before loading 0.4.5 so two versions never write the same management records. Existing settings and compatible v1/v2 records carry forward.
2. Stop the host before restoring management records or downgrading: preview after a restore and sync manually; before downgrading, run `npm run state:compact -- /absolute/path/to/state.json` to merge the journal — never delete an uncompacted journal.
3. A successful readback does not prove session loading. Check models, tools, skills, instructions and subagents in a new Ducoro session or the next conversation turn.
4. Automated regression and browser validation (backup downloads, plan confirmation, bulk undo, draft recovery) finished before release cleanup; script syntax, entry-point import and package consistency checks passed after. Live Magpie/Ducoro account integration and Windows hardware validation remain outstanding.
