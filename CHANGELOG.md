# 更新记录 / Changelog

## 0.4.7 — 2026-11-13

### 中文

- 统一 Magpie 风格的页头、导航、分组设置、控件、状态、备份和弹窗。
- Bot 摘要支持按需展开，增加条目和方案目标边界；模型、连接器、技能编辑区按行对齐。
- 开关仅点击图形范围切换，保留键盘操作；优化注释与表单控件对齐。
- 完整支持中英文、动态状态、错误提示、日期及无障碍标签，语言切换保留草稿和焦点。
- 沿用草稿、预览确认、核验和恢复暂停流程；修复摘要加载及错误提示问题。

### English

- Unify Magpie-style navigation, grouped settings, controls, status views, backups and dialogs.
- Add bordered Bot summaries and plan target groups, with aligned resource editors that expand on demand.
- Limit pointer toggling to switch graphics while retaining keyboard access; align form controls and helper text.
- Support English and Chinese across dynamic states, errors, dates and accessible labels without losing drafts or focus.
- Preserve draft, preview, verification and restore-review workflows; fix summary loading and error feedback.

## 0.4.6 — 2026-11-13

- 完善方案草稿保存、差异检查、变化计数与核验状态。
- 恢复管理记录后保持自动同步暂停，要求先预览影响再明确继续。
- 改进错误定位、键盘焦点、资源搜索和备份摘要。

## 0.4.5 — 2026-11-12

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

## 0.4.3 — 2026-11-08

0.4.3 聚焦同步效率、运行稳定性与备份管理。通过共享技能缓存、合并重复读取、增量保存和按目标重试，减少多 Bot 同步中的重复处理与磁盘写入，并完善任务取消、命令超时及异常恢复。新版集中提供管理记录备份与配置检查点，支持外部备份导入、恢复预览、选择性配置回退和本地记录清理；同时优化同步诊断、中英文界面与窄屏布局，修复增量同步时诊断状态丢失等问题。升级沿用现有设置和管理记录，无需重新配置。

Version 0.4.3 focuses on sync efficiency, reliability, and backup management. Shared skill caching, deduplicated reads, incremental saves, and per-target retries reduce repeated work and disk writes when syncing multiple Bots, while stronger cancellation, timeout handling, and recovery improve resilience. A centralized backup page brings together management-record backups and configuration checkpoints, with external backup import, restore previews, selective configuration rollback, and local record cleanup. This release also refines sync diagnostics, English and Chinese interfaces, and narrow-screen layouts, and fixes diagnostic state being lost during incremental sync. Existing settings and management records carry forward without reconfiguration.

- 复用相同内容的技能产物，合并技能文件与页面清单的并发读取，减少多 Bot 同步的重复准备与命令调用。
- 管理记录采用带序号和校验和的增量日志；操作意图按变更范围保存，按日志条数或大小合并快照，减少小变更时的整份重写。
- 记录各目标操作的期望版本和执行状态，失败及中断后先核对实际结果，再恢复未完成操作。
- 取消及失败时等待已启动任务收尾；命令增加超时收尾、输出容量限制与跨块 UTF-8 解码，页面读取支持独立取消。
- 集中提供管理记录备份、配置检查点、手动备份、打开备份目录、外部 JSON 导入和按类型清空备份。
- 恢复前校验并预览备份，支持选择性配置回退；导入备份不会直接修改当前配置或 Bot。
- 本地记录清理先预览再执行，保留有效归属、原权限恢复数据、未完成操作与使用中的技能；自动限制历史记录及过期缓存累积。
- 增量同步保留其他功能的最近诊断及待处理问题，优化诊断分组、备份入口和维护入口。
- 完善中英文界面、按钮间距、长文案换行及窄屏布局，切换语言保留草稿、弹窗和预览数据。
- 兼容已有 v1/v2 管理记录，保留持锁手动合并日志命令，便于版本回退前维护。

# 更新记录

## 0.4.2 — 2026-11-07

0.4.2 带来更高效的同步与更灵活的 Bot 配置管理。增量同步、技能缓存和并发核验减少重复处理，配置方案支持多个 Bot 持续继承并保留单项覆盖。新增同步进度、模型漂移检测、逐项核验与选择性配置回退，并完善恢复模型管理时的漂移保护和缺失指令核验，让每次变更更清晰、更可靠。界面完整支持中英文，切换语言保留未保存草稿；升级沿用现有设置与管理记录，无需重新配置。

Version 0.4.2 makes synchronization more efficient and Bot configuration more flexible. Incremental sync, skill caching and concurrent verification reduce repeated work, while reusable configuration plans let multiple Bots inherit updates with individual overrides. Sync progress, model drift detection, item-level verification and selective configuration restore make changes easier to follow. This release also strengthens drift protection when resuming model management and detects missing instructions during verification. The interface supports Chinese and English while preserving unsaved drafts when switching languages. Existing settings and management records carry forward without reconfiguration.

- 修复检查点解除模型暂停、扩大目标范围或重新启用连接同步时遗漏漂移检查的问题；正常回退附加写前配置摘要保护。
- 指令核验覆盖期望目标与已有管理记录，首次写入失败不再漏报；目标目录不可读时明确显示待核实。
- 使用本机 Ducoro 的真实 Bot 完成只读修复前后对照，补充回退接口与指令核验自动回归。

- 补齐新增控制台的动态状态、漂移结果、检查点字段/日期、错误提示及无障碍标签国际化；核验接口按请求语言返回说明，保留结构化状态。新增双语切换与接口语言测试。

- 追加按功能及技能来源增量同步、有界文件缓存、在途读取合并、模型并发更新与分步核验。
- 新增持续继承的 Bot 配置方案、同步步骤与耗时、模型漂移处理和选择性配置检查点回退。
- 保留账户撤销优先、写前冲突检查及未知结果读回；模型回退增加配置摘要保护。
- 增加 10/50/100 Bot 模拟基准与并发、缓存、监听、检查点接口回归；相关操作与限制见 README。

- 补齐英文国际化：界面跟随 Magpie 语言设置，切换保留草稿和弹窗；命令行默认英文，支持 `--lang en|zh`；补充英文说明与语言测试。
- 备份列表新增单份删除与确认提示，删除后刷新列表；与同步共用锁，校验备份标识及内容，不修改当前管理记录。

- 新增保存后逐项配置核验与重新读取结果入口。
- 新增 Bot 搜索筛选、待保存计数、模型与资源分配批量复制。
- 新增诊断处理入口、模型匹配解释与内容变化摘要。
- 新增管理记录有效备份、恢复预览与恢复辅助。
- 补充账户权限和本地页面服务回归验证；真实账户与 Magpie Web 代理仍需安装环境验收。

# 更新记录

## 0.4.1 — 2026-11-07

0.4.1 专注打磨现有功能，让同步更稳定、操作更顺畅。新版优化多 Bot 预览的并发读取、超时与取消处理，设置读取完成即可编辑；完善按钮忙碌状态、未保存草稿保护和同步结果反馈，刷新诊断时保留上一份结果。同时修复 Bot 资源卡片三列控件错位，完善自动跟随 Magpie 语言的中英文界面。升级可沿用现有设置与管理记录，无需重新配置。

0.4.1 refines existing features for more reliable synchronization and smoother everyday use. It improves concurrent preview reads, timeouts and cancellation across multiple Bots, while making settings editable as soon as they load. Clearer busy states, unsaved-draft protection and sync feedback make changes easier to manage, and diagnostic refreshes retain the previous results. This release also aligns the three columns of Bot resource controls and improves the Chinese and English interface that follows Magpie’s language. Existing settings and ownership records remain compatible, so no reconfiguration is required.

- 限制账户权限预览的并发读取与等待时间，取消请求时停止相关读取。
- 设置、资源与目录独立加载；统一忙碌状态并阻止旧响应覆盖草稿。
- 重新读取前确认放弃草稿；保存反馈依据同步状态更新，诊断刷新保留旧结果。
- 修复 Bot 卡片三列控件对齐，适配英文换行与窄窗口。
- 整理命令执行与数据投影模块，解除循环依赖。
- 发布目录与压缩包移除测试脚本及过程记录，保留运行文件和必要项目文档。

## 0.4.0 — 2026-11-07

0.4.0 新增逐 Bot 变更预览与保存前确认，可在应用设置前查看模型、连接器、技能分配及账户工具权限的变化，并对照 Magpie 期望与 Ducoro 当前状态。账户权限冲突支持保留 Ducoro 当前配置或重新应用 Magpie 设置，配合分项能力检测、撤销优先和故障隔离，让同步更清晰、更可靠。新版还完善了管理记录保护与监听恢复，提供自动跟随 Magpie 语言的完整中英文界面，切换语言时保留未保存的草稿。

Version 0.4.0 adds per-Bot change previews and a review step before saving, making it easier to see changes to models, connector and skill assignments, and account tool permissions. Compare desired Magpie settings with the current Ducoro state, and resolve permission conflicts by keeping Ducoro’s settings or reapplying Magpie’s. Separate capability checks, prioritized removals and isolated failures make synchronization clearer and more reliable. This release also strengthens ownership record protection and watch recovery, with a complete English and Chinese interface that follows Magpie’s language while preserving unsaved drafts.

- 新增逐 Bot 变更预览与保存前确认，呈现全局和 Bot 层资源迁移、模型及账户工具权限变化。
- Bot 卡片对照 Magpie 期望与 Ducoro 当前状态，期望模型读取 Magpie 导出，并遵守目标 Bot 范围。
- 账户权限冲突支持保留 Ducoro 当前权限或重新应用 Magpie 配置；决定绑定权限快照与管理记录版本，写入前再次核对。
- 分项检测模型目录、模型命令、账户权限操作及 Bot 资源命令，缺少某项能力时其他功能仍可独立同步。
- 账户撤销优先于新增，连接器故障按项隔离，并保留原权限恢复和待核实写入记录。
- 管理记录不可读、损坏或版本未知时暂停同步并保留原件；诊断页提供重新读取入口。
- 监听恢复检查逐步退避，仅在源文件变化时触发降级对账，避免无变化时反复打断读取。
- 修复技能能力误报，区分有效空导出、连接断开与导出不可读，正确显示模型保留或同步暂缓状态。
- 预览、账户抽屉、能力说明、恢复提示及校验错误完整支持中英文；语言切换保留草稿、名称与权限值，时间和列表分隔符同步更新。

## 0.3.5 — 2026-11-06

0.3.5 优化了配置界面与资源分配体验：账户连接器改用侧边抽屉管理，模型能力支持同步、搜索 Ducoro 上游目录，同时精简 Magpie 插件列表中的重复说明与入口。新版界面自动跟随 Magpie 的语言设置，简体和繁体中文使用中文，其余语言使用英文，无需手动切换；语言变化时保留未保存的设置与分配草稿。

0.3.5 improves the settings interface and resource assignment experience. Account connectors are now managed in a side drawer, the model capability catalog can be refreshed and searched, and redundant descriptions and entry points in Magpie’s plugin list have been reduced. The interface automatically follows Magpie’s language settings, displaying Chinese for Simplified or Traditional Chinese and English for all other languages. No manual language switch is needed, and language changes preserve unsaved settings and assignment drafts.

- Magpie 按功能声明自动生成已安装列表说明；`magpie.summary` 用于发现卡片，不能覆盖已安装列表说明。
- 同步更新包版本、诊断报告版本、页面版本标识和安装文档至 0.3.5。
- Bot 账户配置入口移到连接器标题右侧，使用文字按钮和数量摘要；分配方式、账户与工具选择统一在侧边抽屉中编辑，支持关闭保留草稿、Esc 退出和读取失败重试。
- 统一卡片、标签页、输入控件、按钮与移动端布局；断开连接处理和三类资源作用域改用开关，明确显示当前状态。
- 模型能力区域优先展示 Ducoro 上游目录：新增同步按钮、读取时间、目录搜索及上下文信息；手动覆盖和供应商排序折叠到次级设置。
- 同步目录绕过五分钟缓存并请求能力对账；失败保留有效目录及现有参考，未保存设置与手动映射不受刷新影响。
- 自动匹配支持上游新增系列的完整模型 ID；保持版本后缀、路由组同质性检查及手动覆盖优先级。
- 新增完整英文界面：通过 Magpie 页面协议识别界面语言，简体与繁体中文使用中文，其余语言及未知语言回退英文，不提供手动语言开关。
- Magpie 语言变更时直接更新页面文案和辅助标签，不重建控件，不影响未保存的设置与分配；模型、Bot 和资源名称保持原样。
- 统一翻译配置页、模型目录、账户抽屉、校验错误、接口提示和诊断建议；命令行诊断默认输出英文。
- 发布目录清理测试文件、失效测试命令及已取消入口的旧面板文件；安装包和源码包仅保留运行与项目维护所需文件。

## 0.3.4 — 2026-11-06

0.3.4 带来全新的可视化配置页面，在一处管理模型、连接器与技能，支持全局同步和按 Bot 单独分配。模型可跟随 Magpie 默认设置或为指定 Bot 固定选择，连接器同时支持 Magpie 资源库与 Ducoro 账户来源。新版诊断报告每次查看时按需生成，无需导入文件，也不会在本机保存或累积历史报告，并清晰区分查看时间与最近同步时间。同时修复插件重载后页面连接失败的问题，完善自动重连、失败提示与配置校验，让配置和排查更加方便。

Version 0.3.4 introduces a new visual settings page for managing models, connectors, and skills in one place, with global synchronization and per-Bot assignments. Models can follow the Magpie default or be pinned to a specific choice, while connectors support both the Magpie library and Ducoro accounts. Diagnostic reports are generated on demand whenever viewed, with no file imports or locally saved report history, and clearly distinguish viewing time from the latest sync time. This release also fixes page connection failures after plugin reloads and improves automatic reconnection, error messages, and configuration validation.

- 修复插件重载期间端口占用后页面服务永久失联的问题：自动等待旧宿主退出并重新绑定，读取请求短暂失败时自动重试。
- 同步诊断改为每次查看按需生成，只在内存与页面中呈现；移除报告文件导入入口，不再写入统一、指令/子代理及模型能力诊断文件，启动时清理旧版报告。
- 页面分别显示查看时间与最近同步时间，标明同步中和过期结果；连接失败时清空旧结果并给出中文提示。命令行诊断同步改为读取实时服务。

- 实机修复：允许 Magpie 桌面端页面来源，解决服务页面空白。
- 实机修复：账户分配优先显示已连接服务，未连接状态给出明确提示；加载期间锁定新生成的资源控件。

- 侧边栏和页面标题统一为 Ducoro；界面工具资源统一称为“连接器”。
- 作用域及 Bot 卡片按“模型、连接器、技能”三列排列，窄屏自动纵向排列。
- 通过插件本地页面服务自动读取所有 Bot、模型、资源库及账户连接器目录。
- 模型支持全局跟随与按 Bot 单独指定；独立模型不会被全局默认模型变化覆盖。
- 连接器和技能以勾选列表分配；账户连接器按 Bot 指定具体允许工具。
- 连接器撤销恢复原有用户策略，检测外部编辑，支持结果未知时再次核实。
- 页面可按需查看诊断报告或请求重试同步。
- 使用 Magpie 正式页面消息通道保存选项，不额外维护设置副本。

## 0.3.2 — 2026-11-06

0.3.2 新增可视化控制台，可直接管理同步选项、目标 Bot 和模型能力映射，并按 Bot 分配 MCP 与技能。统一诊断报告与只读诊断命令帮助查看同步状态、失败原因和处理建议，控制台支持导入报告快照。新版延续 0.3.1 的模型同步能力，默认保留全局资源同步，并加强配置校验与作用域迁移处理。

Version 0.3.2 introduces a visual console for managing sync settings, target Bots and model capability mappings, with per-Bot MCP and skill assignment. Unified reports and a read-only diagnostics command make sync status, failures and next steps easier to inspect; report snapshots can be imported into the console. This release retains 0.3.1 model synchronization and global resource sync by default, while strengthening configuration validation and scope migration handling.

- 新增 Magpie 内的 Ducoro 可视化配置页面、设置面板和 Agent 菜单诊断入口。
- 新增统一同步报告及只读诊断命令，分别呈现配置状态、失败原因、目标 Bot 和后续操作；运行时加载状态保持明确未知。
- 新增按 Bot 分配 MCP / 技能；支持继承与空清单、目标范围限制、作用域迁移和旧版全局状态升级。
- 新增配置校验，错误的作用域或资源清单会阻止同步，避免扩大资源访问。
- 保留默认全局同步和 0.3.1 模型同步行为。页面通过导入 JSON 查看诊断快照；Magpie 暂未提供读取本地报告的公开页面接口。

验证采用临时目录、模拟 Ducoro CLI 和页面桥接，不修改真实配置、不调用 LLM。

## 0.3.1 — 2026-11-06

0.3.1 新增模型与路由组的自动同步和官方能力映射：保持 Magpie 原有的模型选择与路由方式，
为每个单模型和路由组分别识别模型身份，优先使用 z.ai、Kimi Coding 等官方目录条目
填充 Ducoro 的“这个模型类似哪一款？”。切换默认模型时，关联 Bot 会自动跟随，
并修复失效的旧模型 ID；支持的思考档位会保留。对于混合模型组、未知版本和已知能力
超限，插件提供原因、候选及能力差异报告，避免错误匹配。同时支持手动指定或禁用
映射、组成员变化监听、失败重试及重启恢复。

Version 0.3.1 adds automatic model sync and official capability mapping for models and route groups: it keeps Magpie's existing model selection and routing, identifies the model identity of each single model and route group, and prefers official catalog entries such as z.ai and Kimi Coding to fill Ducoro's "which model is this like?" reference. Switching the default model follows the associated Bots automatically and repairs stale model IDs; supported thinking tiers are preserved. For mixed model groups, unknown versions and known capability overruns, the plugin reports reasons, candidates and capability diffs to avoid wrong matches. It also supports manually specifying or disabling mappings, group membership change listeners, failure retry and restart recovery.

验证：57 项隔离测试通过；Ducoro 实机验证了 GLM 路由组和单模型对话、旧 Bot 修复及
官方参考保存，两次真实对话均成功，测试后已恢复原 GLM 路由组。

限制：自动匹配以 Ducoro 当前目录和可读取的组成员为依据；无法确认的版本不会降级
匹配。混合组的共同能力仅作诊断，不能通过现有参考接口写成任意自定义能力配置。

详情见 [README](README.md)。
