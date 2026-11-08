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
