// Shared, dependency-free message catalog for the page service, CLI and classic browser scripts.
// Only plugin-authored strings are translated; names and values are interpolation arguments.
(() => {
  const ENGLISH = {
  "网关连接": "Gateway connection",
  "同步连接地址、密钥与模型目录": "Sync the connection address, key and model catalog",
  "Bot 模型跟随": "Follow Bot models",
  "更新绑定 Bot，修复失效模型 ID": "Update linked Bots and repair invalid model IDs",
  "连接器": "Connectors",
  "同步资源库连接器与 Bot 账户工具配备": "Sync library connectors and Bot account tools",
  "技能": "Skills",
  "同步完整技能包与附属文件": "Sync complete skill packages and supporting files",
  "指令": "Instructions",
  "同步到目标 Bot 的指令区块": "Sync instruction blocks to target Bots",
  "子代理": "Subagents",
  "同步显式选择的角色定义": "Sync explicitly selected role definitions",
  "插件选项格式无效，请先在 Magpie 的 JSON 选项中修复。": "Invalid plugin options. Fix them in Magpie's JSON options first.",
  "{0} 必须是开关值。": "{0} must be a boolean.",
  "连接标识仅支持小写字母、数字和短横线。": "The connection ID may contain only lowercase letters, digits and hyphens.",
  "请选择有效的断开连接处理方式。": "Choose a valid action for disconnection.",
  "模型或连接器分配格式无效。": "Invalid model or connector assignments.",
  "请选择有效的 连接器 作用域。": "Choose a valid connector scope.",
  "技能作用域需要一个有效的 Bot ID。": "The skill scope requires a valid Bot ID.",
  "{0} 需要名称列表。": "{0} must be a list of names.",
  "单个列表最多支持 256 项。": "Each list supports up to 256 items.",
  "目标 Bot ID 格式应为 agt-…，请从 Ducoro 复制。": "Target Bot IDs must start with agt-…. Copy them from Ducoro.",
  "子代理名称需要 2–50 个小写字母、数字或短横线，不能使用 default 或 main。": "Subagent names need 2–50 lowercase letters, digits or hyphens, and cannot be default or main.",
  "官方供应商应使用目录 ID，例如 zai 或 kimi-coding。": "Use catalog provider IDs, such as zai or kimi-coding.",
  "模型能力参考需要映射对象。": "Model capability references must be a mapping object.",
  "模型映射请填写完整的 供应商/模型 或 group/组名；禁用映射时勾选「禁用自动映射」。": "Enter a complete provider/model or group/name. Select “Disable automatic mapping” to disable a mapping.",
  "Bot 资源分配需要对象。": "Bot resource assignments must be an object.",
  "资源分配中的 Bot ID 格式应为 agt-…。": "Bot IDs in resource assignments must start with agt-….",
  "Bot 资源分配仅支持 连接器 和技能。": "Bot resource assignments support only connectors and skills.",
  "自定义资源请填写资源库名称列表，留空代表不分配。": "Enter library resource names. Leave the list empty to assign none.",
  "这些设置已在其他页面更新。请点击「重新读取」后再修改，避免覆盖新配置。": "These settings changed on another page. Select “Reload settings” before editing to avoid overwriting them.",
  "模型与能力": "Models and capabilities",
  "配置已同步": "Configuration synced",
  "等待处理": "Pending",
  "已关闭": "Disabled",
  "已跳过": "Skipped",
  "尚未确认": "Unconfirmed",
  "实时诊断报告格式无法识别，请更新插件并重新打开页面。": "Unrecognized live diagnostic report. Update the plugin and reopen the page.",
  "需要进一步检查": "Further investigation needed",
  "发送的模型 / 路由组": "Model / route group to send",
  "官方目录参考": "Official catalog reference",
  "移除": "Remove",
  "移除模型映射": "Remove model mapping",
  "禁用自动映射": "Disable automatic mapping",
  "{0} 项覆盖": "Overrides: {0}",
  "已开启 · 断开时移除": "On · Remove on disconnect",
  "已关闭 · 断开时保留": "Off · Keep on disconnect",
  "已开启 · 按 Bot 单独配置": "On · Configure each Bot",
  "已关闭 · 全局同步": "Off · Sync globally",
  "共 {0} 个模型{1}{2}": "Models: {0}{1}{2}",
  " · 找到 {0} 项": " · {0} matches",
  " · 显示前 100 项，请搜索缩小范围": " · Showing the first 100; search to narrow the list",
  "{0} 上下文": "Context: {0}",
  "上下文未提供": "Context size unavailable",
  "没有匹配的模型。": "No matching models.",
  "目录尚未加载，请同步上游模型列表。": "The catalog is not loaded. Sync the upstream model list.",
  "正在同步…": "Syncing…",
  "正在读取…": "Reading…",
  "上游模型目录格式无法识别。": "Unrecognized upstream model catalog.",
  "{0} 个模型 · 最近读取 {1}": "Models: {0} · Last read {1}",
  "上游暂不可用，正在显示上次成功读取的目录。请稍后重新同步。": "Upstream is unavailable. Showing the last successfully loaded catalog. Try syncing again later.",
  "已重新读取 Ducoro 上游目录，并请求重新匹配模型能力。手动覆盖和未保存设置已保留。": "Reloaded the Ducoro upstream catalog and requested capability matching. Manual overrides and unsaved settings are preserved.",
  "{0} 个模型 · 本次更新失败，显示上次目录": "Models: {0} · Update failed; showing the previous catalog",
  "上游目录暂不可用": "Upstream catalog unavailable",
  "↻ 同步上游模型列表": "↻ Sync upstream model list",
  "连接标识：{0} · 设置已读取，同步结果请查看同步诊断": "Connection ID: {0} · Settings loaded; see Sync diagnostics for results",
  "模型 {0} 重复，请仅保留一条映射。": "Duplicate model {0}. Keep only one mapping.",
  "（空名称）": "(empty name)",
  "有未保存的修改": "Unsaved changes",
  "设置与已读取配置一致": "Settings match the loaded configuration",
  "无法读取设置：{0}": "Could not read settings: {0}",
  "配置尚未读取，未执行任何修改": "Configuration not loaded; no changes made",
  "读取失败": "Read failed",
  "没有需要保存的修改。": "There are no changes to save.",
  "设置已保存，正在同步。稍后刷新报告可查看结果。": "Settings saved. Sync is running; refresh the report shortly to see the results.",
  "保存失败，请重试。": "Save failed. Try again.",
  "报告未提供时间": "Report time unavailable",
  "尚未完成同步": "No sync completed yet",
  "查看时间：{0} · 最近同步：{1}{2}": "Viewed: {0} · Last sync: {1}{2}",
  " · 同步结果待更新": " · Sync results need updating",
  "未选择资源": "No resources selected",
  "{0} 个记录条目": "Records: {0}",
  "服务探测通过": "Service probe passed",
  "服务探测未通过": "Service probe failed",
  "服务探测未确认": "Service probe unconfirmed",
  "目标：{0}": "Targets: {0}",
  "报告未记录待处理问题；运行中会话的加载状态仍需单独确认。": "No pending issues were recorded. Check separately whether running sessions have loaded the resources.",
  "同步诊断": "Sync diagnostics",
  "建议：{0}": "Suggestion: {0}",
  "受影响 Bot：{0}": "Affected Bots: {0}",
  "{0}报告仅在页面中显示，不保存到本机。": "{0}The report is shown only on this page and is not saved locally.",
  "正在同步，当前显示最近已完成的结果。": "Sync is running. Showing the latest completed results. ",
  "已生成本次诊断报告。": "Generated the current diagnostic report. ",
  "正在生成实时诊断报告…": "Generating a live diagnostic report…",
  "已请求重新同步，请稍后刷新报告。": "Sync requested. Refresh the report shortly.",
  "请从 Magpie 中打开 Ducoro，以读取和保存插件设置。": "Open Ducoro from Magpie to read and save plugin settings.",
  "尚未连接 Magpie 页面接口": "Not connected to the Magpie page interface",
  "未读取配置": "Configuration not read",
  "Magpie 页面接口暂不可用：{0}": "Magpie page interface unavailable: {0}",
  "页面接口未就绪": "Page interface not ready",
  "页面暂不可用：{0}": "Page unavailable: {0}",
  "来自 Magpie": "From Magpie",
  "此 Bot 的运行方式暂不支持资源库分配。": "This Bot runtime does not support library assignments yet.",
  "资源库暂不可读，保留现有分配。": "The library is unavailable. Existing assignments are preserved.",
  "继承资源库勾选": "Inherit library selections",
  "单独选择": "Choose individually",
  "不分配": "Assign none",
  "{0} {1}分配方式": "{0} {1} assignment mode",
  "选择{0}": "Select {0}",
  "（当前不可用）": " (currently unavailable)",
  "资源库中尚无可分配资源。": "No assignable resources in the library.",
  "已选择 {0} 项": "{0} selected",
  "全局同步 · {0} 项资源库勾选": "Global sync · Library selections: {0}",
  "模型": "Model",
  "跟随全局模型": "Follow the global model",
  "{0}（当前不可用）": "{0} (currently unavailable)",
  "{0} 模型": "{0} model",
  "全局模型：{0}；当前：{1}": "Global model: {0}; current: {1}",
  "尚不可用": "Unavailable",
  "未配置": "Not configured",
  "当前：{0}。仅管理绑定本插件连接的 Pi Agent 模型。": "Current: {0}. Only Pi Agent models linked to this plugin connection are managed.",
  "已配备 {0} 项": "{0} equipped",
  "配备待查看": "Equipment not checked",
  "账户配置": "Account settings",
  "{0} 账户配置": "{0} account settings",
  "账户连接器": "Account connectors",
  "{0} · 来自 Ducoro · 按 Bot 配备": "{0} · From Ducoro · Equipped per Bot",
  "关闭账户配置": "Close account settings",
  "完成": "Done",
  "关闭后保留草稿，点击「保存设置」后生效。": "Your draft is kept when closed. Select “Save settings” to apply it.",
  "正在读取当前配备…": "Reading current equipment…",
  "账户目录暂不可用，请关闭抽屉并刷新 Bot 列表后重试。现有配备已保留。": "Account catalog unavailable. Close this drawer and refresh the Bot list, then try again. Existing equipment is preserved.",
  "当前配备 {0} 项。仅已连接的账户可同步；请先在 Ducoro 中连接需要的服务。": "{0} currently equipped. Only connected accounts can sync. Connect the required services in Ducoro first.",
  "保持现有配备": "Keep current equipment",
  "单独指定": "Specify individually",
  "不分配插件管理的连接器": "Remove plugin-managed connector assignments",
  "{0} 账户连接器分配方式": "{0} account connector assignment mode",
  "{0}{1} · 已选择 {2} 项工具": "{0}{1} · Tools selected: {2}",
  "（当前未连接）": " (not connected)",
  "选择允许使用的工具": "Select allowed tools",
  "{0} · 已选择 {1} 项工具": "{0} · Tools selected: {1}",
  "当前没有可分配工具。": "No tools available to assign.",
  "尚无已连接的账户连接器。请先在 Ducoro 连接服务，再刷新列表。": "No connected account connectors yet. Connect services in Ducoro, then refresh the list.",
  "分配方式": "Assignment mode",
  "重试读取": "Retry",
  "正在刷新 Bot 和资源…": "Refreshing Bots and resources…",
  "{0} 个 Bot · 刷新于 {1} · 未保存的选择已保留": "Bots: {0} · Refreshed {1} · Unsaved selections preserved",
  "Bot 列表读取失败，现有选择已保留。": "Could not read the Bot list. Existing selections are preserved.",
  "请从 Magpie 打开此页面，或重新读取。": "Open this page from Magpie, or reload settings.",
  "暂时无法连接 Ducoro 插件页面服务。请稍后重试；若持续失败，请在 Magpie 中重新加载插件并打开 Ducoro 页面。": "Cannot connect to the Ducoro plugin page service. Try again later. If this persists, reload the plugin in Magpie and reopen Ducoro.",
  "页面服务返回内容无效，请重新打开 Ducoro 页面。": "Invalid page service response. Reopen the Ducoro page.",
  "读取失败，请重试。": "Read failed. Try again.",
  "Ducoro 页面未就绪，请重新打开。": "The Ducoro page is not ready. Reopen it.",
  "部分账户连接器尚未完成配备。": "Some account connectors are not fully equipped.",
  "检查账户连接状态、Bot 支持情况及允许工具，然后重试。": "Check account connections, Bot support and allowed tools, then retry.",
  "连接同步未完成。": "Connection sync is incomplete.",
  "检查 Ducoro 是否可用及 Magpie 连接设置，然后等待重试。": "Check Ducoro availability and the Magpie connection settings, then wait for a retry.",
  "Magpie 连接导出暂时缺失或不完整。": "The Magpie connection export is missing or incomplete.",
  "在 Magpie 中确认 Ducoro 已连接，并重新同步。": "Confirm that Ducoro is connected in Magpie, then sync again.",
  "所选模型不在完整的导出列表中。": "The selected model is missing from the complete export list.",
  "刷新 Magpie 模型列表并确认默认模型仍可用。": "Refresh the Magpie model list and confirm that the default model is still available.",
  "部分 Bot 的模型设置未通过校验。": "Some Bot model settings failed validation.",
  "检查目标 Bot 与连接的模型能力设置，完成后等待重试。": "Check target Bots and connection capabilities, then wait for a retry.",
  "模型或路由组元数据暂时不可读。": "Model or route group metadata is temporarily unreadable.",
  "检查 Magpie 供应商及路由组配置，恢复后会自动重试。": "Check Magpie providers and route groups. Sync will retry automatically after recovery.",
  "部分 连接器 配置未完成同步。": "Some connector settings have not synced.",
  "检查 连接器 定义、工具限制和 Ducoro 可用性，然后等待重试。": "Check connector definitions, tool restrictions and Ducoro availability, then wait for a retry.",
  "连接器 目标已有用户配置，插件保留原内容。": "The connector target has user configuration. Its contents are preserved.",
  "检查同名 连接器，保留本地配置或调整目标与名称后重新同步。": "Check the connector with the same name. Keep the local configuration or adjust the target and name before syncing again.",
  "连接器 可用性探测未通过。": "The connector availability probe failed.",
  "检查该 连接器 的依赖、授权及服务状态；配置保存不代表工具可用。": "Check the connector's dependencies, authorization and service status. Saved settings do not prove tool availability.",
  "无法读取目标作用域的技能列表。": "Could not read the skill list for the target scope.",
  "检查 Ducoro 和目标 Bot 是否可用，然后等待重试。": "Check Ducoro and the target Bot, then wait for a retry.",
  "部分选中技能的源文件不可读或无效。": "Some selected skill source files are unreadable or invalid.",
  "检查 Magpie 资源库中的技能目录与 SKILL.md。": "Check skill directories and SKILL.md in the Magpie library.",
  "旧技能的撤销尚未完成。": "Old skill removal is incomplete.",
  "检查目标技能作用域及权限，然后等待重试。": "Check the target skill scope and permissions, then wait for a retry.",
  "技能替换前的备份未完成。": "The backup before skill replacement is incomplete.",
  "检查 Ducoro 技能目录状态；旧版本会保留并重试。": "Check the Ducoro skill directory. The previous version is preserved and will be retried.",
  "技能替换或恢复尚未完成。": "Skill replacement or restoration is incomplete.",
  "检查目标技能及备份状态；不要手动删除插件备份。": "Check the target skill and backup. Do not manually delete plugin backups.",
  "技能导入未完成。": "Skill import is incomplete.",
  "检查技能格式及 Ducoro 可用性，然后等待重试。": "Check the skill format and Ducoro availability, then wait for a retry.",
  "技能暂存或内容校验未完成。": "Skill staging or content verification is incomplete.",
  "确认技能源文件稳定且完整，然后等待重试。": "Confirm that skill source files are stable and complete, then wait for a retry.",
  "技能同步未完成。": "Skill sync is incomplete.",
  "检查资源库、技能目录和 Ducoro 可用性，然后等待重试。": "Check the library, skill directory and Ducoro availability, then wait for a retry.",
  "技能目标已有用户配置，插件保留原内容。": "The skill target has user configuration. Its contents are preserved.",
  "检查同名技能，保留本地配置或调整目标与名称后重新同步。": "Check the skill with the same name. Keep the local configuration or adjust the target and name before syncing again.",
  "指令或子代理同步未完成。": "Instruction or subagent sync is incomplete.",
  "检查目标 Bot、指令导出和子代理定义。": "Check target Bots, exported instructions and subagent definitions.",
  "指令或子代理需要再次对账。": "Instructions or subagents need another sync check.",
  "检查对应资源和目标 Bot；不支持的字段需要调整。": "Check the resources and target Bots. Adjust unsupported fields.",
  "Magpie 资源选择暂时不可读。": "Magpie resource selections are temporarily unreadable.",
  "检查 Magpie 资源库配置并重新同步，现有配置会保留。": "Check the Magpie library settings and sync again. Existing configuration is preserved.",
  "无法确认按 Bot 分配资源的目标。": "Could not confirm target Bots for resource assignments.",
  "检查目标 Bot ID、连接绑定及 Ducoro 可用性。": "Check target Bot IDs, connection bindings and Ducoro availability.",
  "按 Bot 分配资源的选项无效。": "Invalid per-Bot resource assignment options.",
  "检查资源作用域和 resourceAssignments 中的名称列表。": "Check resource scopes and the name lists in resourceAssignments.",
  "部分指定资源未启用、未分配给 Ducoro 或名称不存在。": "Some specified resources are disabled, not assigned to Ducoro, or no longer exist.",
  "检查 Magpie 资源库中的精确名称、启用状态及 Ducoro 分配。": "Check exact resource names, enabled states and Ducoro assignments in the Magpie library.",
  "插件选项未通过校验，本轮不会写入配置。": "Plugin options failed validation. No configuration will be written in this sync.",
  "在插件配置页面修正标出的选项，然后重新保存。": "Fix the indicated options on the plugin settings page, then save again.",
  "目标配置由用户创建或已被手动修改，插件保留原内容。": "The target configuration was created or modified by the user. Its contents are preserved.",
  "检查冲突项，确认保留本地配置或调整插件的目标与名称后重新同步。": "Review the conflicts. Keep the local configuration or adjust the plugin target and name before syncing again.",
  "本轮同步未完整结束。": "This sync did not complete.",
  "查看插件日志的详细原因，修复后重新同步。": "Check the plugin log for details, fix the issue and sync again.",
  "另一个插件宿主正在同步。": "Another plugin host is syncing.",
  "等待正在运行的同步完成。": "Wait for the current sync to finish.",
  "文件监听暂时不可用。": "File watching is temporarily unavailable.",
  "等待定时对账；持续出现时重新启用插件。": "Wait for periodic sync. Re-enable the plugin if this persists.",
  "部分源文件尚不存在。": "Some source files do not exist yet.",
  "确认 Magpie 已导出配置与所选资源。": "Confirm that Magpie has exported the configuration and selected resources.",
  "文件监听刷新未完成。": "File watcher refresh is incomplete.",
  "等待自动重试；持续出现时重新启用插件。": "Wait for an automatic retry. Re-enable the plugin if this persists.",
  "部分模型能力参考需要人工确认。": "Some model capability references need manual review.",
  "查看同步诊断，按实际能力指定或禁用参考映射。": "Check Sync diagnostics. Specify or disable references based on actual capabilities.",
  "模型能力参考更新尚未核实。": "Model capability reference updates have not been verified.",
  "检查连接同步是否成功，然后等待重试。": "Check whether connection sync succeeded, then wait for a retry.",
  "指令尚未完成配置。": "Instructions are not fully configured.",
  "检查 Magpie 指令导出及目标 Bot 的 Profile。": "Check Magpie's instruction export and the target Bot's Profile.",
  "部分子代理尚未完成配置。": "Some subagents are not fully configured.",
  "检查显式选择、定义字段及本地 Ducoro 守护进程。": "Check explicit selections, definition fields and the local Ducoro daemon.",
  "没有可用的目标 Bot。": "No target Bots available.",
  "将 Bot 绑定到 Magpie 连接，或填写目标 Bot ID。": "Link a Bot to the Magpie connection, or enter a target Bot ID.",
  "插件尚未完成本次启动后的同步。": "The plugin has not completed a sync since startup.",
  "等待同步完成后重新查看报告。": "Wait for sync to finish, then view the report again.",
  "无法连接插件的实时诊断服务。": "Cannot connect to the plugin's live diagnostics service.",
  "确认 Magpie 已启用 Ducoro 插件；重新打开页面，或检查服务端口。": "Confirm that the Ducoro plugin is enabled in Magpie. Reopen the page or check the service port.",
  "同步报告不可读或格式无效。": "The sync report is unreadable or invalid.",
  "启动插件重新同步以生成报告。": "Start the plugin and sync again to generate a report.",
  "同步需要进一步检查。": "Sync needs further investigation.",
  "查看插件日志并重新同步。": "Check the plugin log and sync again.",
  "连接": "Connection",
  "Bot 模型": "Bot models",
  "配置已对账": "Configuration reconciled",
  "待处理": "Pending",
  "本轮未配置": "Not configured this sync",
  "未知": "Unknown",
  "Ducoro 同步诊断 · {0}": "Ducoro sync diagnostics · {0}",
  "查看时间：{0}": "Viewed: {0}",
  "最近同步：{0}{1}": "Last sync: {0}{1}",
  "（同步结果待更新）": " (sync results need updating)",
  "报告按需生成，不保存本地文件。": "Reports are generated on demand and are not saved locally.",
  "整体：{0}": "Overall: {0}",
  "会话加载状态：未知；保存配置不代表运行中的会话已加载。": "Session load status: unknown. Saved settings do not prove that running sessions have loaded them.",
  " · {0} 项": " · {0} items",
  "下一步：{0}": "Next step: {0}",
  "Ducoro 守护进程：{0}": "Ducoro daemon: {0}",
  "可连接（只读 info 检查）": "Reachable (read-only info check)",
  "不可确认": "Unconfirmed",
  "确认 Ducoro CLI 已安装且命令路径可用。": "Confirm that Ducoro CLI is installed and the command path is available.",
  "确认 Ducoro 正在运行，然后重新检查。": "Confirm that Ducoro is running, then check again.",
  "Ducoro 返回了无法识别的状态，请检查 CLI 版本。": "Ducoro returned an unrecognized status. Check the CLI version.",
  "此检查只证明 info 请求成功，不证明模型或工具可用。": "This check proves only that info succeeded, not that models or tools work.",
  "确认 Ducoro 正在运行并检查 CLI 与守护进程版本。": "Confirm that Ducoro is running and check the CLI and daemon versions.",
  "返回的列表格式无法识别": "Unrecognized list format",
  "{0}读取失败，请确认 Ducoro 已启动并刷新。": "Could not read {0}. Confirm that Ducoro is running, then refresh.",
  "Bot 列表": "Bot list",
  "模型列表": "Model list",
  "Ducoro 连接器目录": "Ducoro connector catalog",
  "Magpie 资源库读取失败，现有分配会保留。": "Could not read the Magpie library. Existing assignments are preserved.",
  "尚未找到 Magpie 模型连接，请先在 Magpie 中连接 Ducoro。": "Magpie model connection not found. Connect Ducoro in Magpie first.",
  "Ducoro 账户连接器目录暂不可用，请检查账户配对状态。": "The Ducoro account connector catalog is unavailable. Check account pairing.",
  "页面令牌文件无效": "Invalid page token file",
  "Ducoro 暂不可用，或不支持此操作。请检查后台及账户状态。": "Ducoro is unavailable or does not support this operation. Check the daemon and account status.",
  "访问地址无效": "Invalid host address",
  "请求来源无效": "Invalid request origin",
  "页面连接已更新，请重新读取页面": "The page connection has changed. Reload the page.",
  "连接器标识无效": "Invalid connector ID",
  "Bot 标识无效": "Invalid Bot ID",
  "设置内容过大": "Settings are too large",
  "设置格式无效，请检查分配和工具权限。": "Invalid settings. Check assignments and tool permissions.",
  "操作不存在": "Operation not found",
  "不支持此操作": "Operation not supported",
  "文件不存在": "File not found",
  "读取失败，请检查 Ducoro 是否运行，然后重试。": "Read failed. Confirm that Ducoro is running, then retry.",
  "无法同步 Ducoro 模型目录，请确认 Ducoro 后台已启动并更新后重试。现有能力参考已保留。": "Could not sync the Ducoro model catalog. Confirm that the Ducoro daemon is running and updated, then retry. Existing capability references are preserved.",
  "Ducoro 模型目录暂不可用，请启动 Ducoro 后重试。": "Ducoro model catalog unavailable. Start Ducoro and retry.",
  "在一处管理连接、同步范围和每个 Bot 的资源。": "Manage connections, sync scopes and resources for every Bot in one place.",
  "正在读取插件配置…": "Reading plugin settings…",
  "同步设置": "Sync settings",
  "Bot 资源": "Bot resources",
  "同步哪些内容": "What to sync",
  "保存后由插件自动对账，运行中的会话可能需要重新加载资源。": "Saving starts automatic sync. Running sessions may need to reload resources.",
  "配置": "Settings",
  "连接与目标": "Connection and targets",
  "连接标识": "Connection ID",
  "已有连接请保持原标识，避免另建连接。": "Keep the existing connection ID to avoid creating another connection.",
  "断开连接后": "On disconnect",
  "移除网关连接": "Remove gateway connection",
  "关闭时保留网关连接": "Keep the gateway connection when off",
  "仅移除插件拥有的连接；资源分配按各自范围同步。": "Only plugin-owned connections are removed. Resource assignments sync within their own scopes.",
  "选择的子代理名称": "Selected subagent names",
  "仅同步显式选择的子代理；现有模型与工具限制仍适用。": "Only explicitly selected subagents sync. Existing model and tool restrictions still apply.",
  "模型能力参考": "Model capability references",
  "优先使用 Ducoro 上游目录自动匹配，特殊需求再手动指定。": "Automatically match the Ducoro upstream catalog. Add manual overrides for special requirements.",
  "Ducoro 上游": "Ducoro upstream",
  "正在读取模型目录…": "Reading model catalog…",
  "读取当前 Ducoro 提供的目录；新模型随 Ducoro 更新后可在此同步。": "Read the catalog currently provided by Ducoro. Sync here after updating Ducoro to load new models.",
  "查看上游模型目录": "View upstream model catalog",
  "搜索上游模型": "Search upstream models",
  "手动指定能力参考": "Manual capability references",
  "0 项覆盖": "Overrides: 0",
  "手动指定优先于自动匹配；移除映射即可恢复跟随上游。": "Manual references take priority over automatic matching. Remove a mapping to follow upstream again.",
  "＋ 添加映射": "＋ Add mapping",
  "暂无手动覆盖，所有模型跟随上游自动匹配。": "No manual overrides. All models use automatic upstream matching.",
  "自动匹配的供应商优先顺序": "Provider priority for automatic matching",
  "官方供应商优先顺序": "Official provider priority",
  "仅用于多个上游条目匹配同一模型时排序，每行一个供应商。": "Used only to rank multiple upstream entries for the same model. One provider per line.",
  "让每个 Bot 各取所需": "Give each Bot the resources it needs",
  "选择同步方式，再为各个 Bot 分配模型、连接器和技能。": "Choose sync modes, then assign models, connectors and skills to each Bot.",
  "按需分配": "Assign as needed",
  "模型作用域": "Model scope",
  "按 Bot 分配": "Assign per Bot",
  "当前为全局同步": "Currently syncing globally",
  "关闭时跟随 Magpie 所选模型。": "When off, follow the model selected in Magpie.",
  "连接器作用域": "Connector scope",
  "适用于 Magpie 来源；Ducoro 账户连接器始终按 Bot 配备。": "Applies to Magpie sources. Ducoro account connectors are always equipped per Bot.",
  "技能作用域": "Skill scope",
  "关闭时跟随资源库勾选，开启后可为 Bot 单独选择。": "When off, follow library selections. Turn on to choose resources for each Bot.",
  "单独分配可选择继承、指定资源或不分配。本页仅撤销插件管理的分配，其他全局资源和用户自行配置的资源仍可能生效。": "Assignments can inherit, specify resources or assign none. This page revokes only plugin-managed assignments. Other global or user-configured resources may still apply.",
  "正在读取 Ducoro Bot 和资源…": "Reading Ducoro Bots and resources…",
  "刷新列表": "Refresh list",
  "尚无 Bot": "No Bots yet",
  "在 Ducoro 中创建 Bot 后刷新列表。": "Create a Bot in Ducoro, then refresh the list.",
  "同步结果，一目了然": "Sync results at a glance",
  "每次查看生成当前报告，或重试同步后再次查看。": "Generate a current report, or retry sync and view it again.",
  "实时诊断": "Live diagnostics",
  "当前同步结果": "Current sync results",
  "报告按需生成，仅在当前页面显示，不保存文件或累积历史。": "Reports are generated on demand and displayed only on this page. No files or report history are saved.",
  "重新查看报告": "Refresh report",
  "重试同步": "Retry sync",
  "等待查看实时报告": "Ready to view a live report",
  "打开同步诊断或点击「重新查看报告」时生成。": "Generated when you open Sync diagnostics or select “Refresh report”.",
  "如暂时连接失败，请稍后重试；无需导入报告文件。": "If the connection fails, try again later. No report import is needed.",
  "按需生成 · 不保存": "On demand · Not saved",
  "需要关注": "Needs attention",
  "报告说明配置层的同步情况。除非报告明确验证，否则不代表运行中的会话已加载新的工具、技能或子代理。": "This report describes configuration sync. Unless explicitly verified, it does not prove that running sessions loaded new tools, skills or subagents.",
  "正在加载…": "Loading…",
  "重新读取": "Reload settings",
  "保存设置": "Save settings",
  "控制台页面": "Console pages",
  "断开连接后移除插件拥有的网关连接": "Remove the plugin-owned gateway connection on disconnect",
  "搜索模型名称或供应商": "Search model names or providers",
  "模型按 Bot 分配": "Assign models per Bot",
  "连接器按 Bot 分配": "Assign connectors per Bot",
  "技能按 Bot 分配": "Assign skills per Bot",
  "管理同步开关。Bot 分配、模型映射与实时诊断请打开侧边栏「Ducoro」。": "Manage sync switches here. Open Ducoro in the sidebar for Bot assignments, model mappings and live diagnostics.",
  "正在打开 Ducoro…": "Opening Ducoro…",
  "重新打开": "Reopen"
}

  Object.assign(ENGLISH, {
  "预览变化": "Preview changes",
  "保存前预览": "Review before saving",
  "逐 Bot 变更预览": "Changes by Bot",
  "返回修改": "Back to editing",
  "确认保存并同步": "Save and sync",
  "关闭": "Close",
  "未配备": "Not equipped",
  "无": "None",
  "允许：{0}；拒绝：{1}": "Allow: {0}; deny: {1}",
  "新增": "Add",
  "更新": "Update",
  "撤销": "Remove",
  "恢复原权限": "Restore previous permissions",
  "保持": "Keep",
  "外部修改冲突": "External changes conflict",
  "由 Ducoro 管理": "Managed in Ducoro",
  "Magpie 尚未连接，保持当前模型": "Magpie is disconnected; keep the current model",
  "Magpie 导出暂不可读，模型同步暂缓": "Magpie export is unavailable; model sync is deferred",
  "已一致": "Up to date",
  "等待同步": "Pending sync",
  "目标模型当前不可用": "The target model is unavailable",
  "写入能力尚未确认": "Write support has not been confirmed",
  "此 Bot 模型不在同步范围": "This Bot’s model is outside the sync scope",
  "Ducoro 当前模型\n{0}": "Current model in Ducoro\n{0}",
  "Magpie 期望模型\n{0}": "Desired model in Magpie\n{0}",
  "未配置": "Not configured",
  "保持当前模型": "Keep the current model",
  "资源库连接器": "Library connectors",
  "{0} · 预计获得：{1}；预计失去插件提供的资源：{2}": "{0} · Expected additions: {1}; plugin resources no longer provided: {2}",
  "{0} · {1} · {2}": "{0} · {1} · {2}",
  "{0} · {1}": "{0} · {1}",
  "Ducoro 当前权限\n{0}": "Current permissions in Ducoro\n{0}",
  "Magpie 期望 / 撤销后恢复\n{0}": "Desired in Magpie / restored on removal\n{0}",
  "保持当前权限": "Keep the current permissions",
  "采用 Ducoro 当前权限": "Use current Ducoro permissions",
  "重新应用 Magpie 权限": "Reapply Magpie permissions",
  "账户工具当前权限读取失败，无法确认差异；现有权限会保留。": "Could not read current account tool permissions. Differences are unknown; existing permissions will be kept.",
  "没有分配范围变化。": "No changes to assignment scopes.",
  "读取时间：{0}。同步前会再次校验当前状态。": "Read at: {0}. Current settings will be checked again before syncing.",
  "请先恢复管理记录或数据来源，再重新预览。同步诊断中可重新读取管理记录。": "Restore the ownership record or data source, then preview again. You can request another read of the ownership record under Sync diagnostics.",
  "宿主能力检测": "Host capabilities",
  "上游模型目录": "Upstream model catalog",
  "Bot 模型命令": "Bot model commands",
  "账户权限读取": "Read account permissions",
  "账户配备命令": "Equip account connectors",
  "账户权限更新命令": "Update account permissions",
  "账户撤销命令": "Remove account connectors",
  "按 Bot 连接器": "Per-Bot connectors",
  "按 Bot 技能": "Per-Bot skills",
  "{0}：{1}": "{0}: {1}",
  "本地命令可用，执行权限仍需同步时核实": "Local command available; execution permissions still need verification during sync",
  "当前不可用，其他功能可独立同步": "Unavailable; other features can sync independently",
  "草稿已变化，可点击「预览变化」重新核对。": "The draft has changed. Select “Preview changes” to check it again.",
  "当前宿主缺少按 Bot 分配此资源的命令，现有设置已保留。": "This host does not provide the command to assign this resource per Bot. Existing settings are kept.",
  "Magpie 期望：{0}": "Desired in Magpie: {0}",
  "目标模型尚不可用": "Target model unavailable",
  "模型写入命令不可用或未确认，其他资源可独立同步。": "Model write commands are unavailable or unconfirmed. Other resources can sync independently.",
  "此 Bot 不在目标列表中，模型设置保持不变。": "This Bot is not in the target list. Its model settings will be kept.",
  "账户工具命令不可用": "Account tool commands unavailable",
  "期望与当前状态": "Desired and current settings",
  "读取于 {0}": "Read at {0}",
  "冲突处理已加入草稿，请重新预览后保存。": "Your conflict resolution is in the draft. Preview again before saving.",
  "配置在预览期间已变化，请重新读取并再次预览。": "Settings changed while the preview was open. Reload and preview again.",
  "管理记录恢复": "Restore the ownership record",
  "若 state.json 无法读取、损坏或版本未知，插件会暂停同步并保留原件。请检查文件权限，或恢复原有有效备份后重新读取；不要删除或清空管理记录，以免丢失权限恢复信息。": "If state.json cannot be read, is damaged or has an unknown version, the plugin pauses sync and keeps the original file. Check file permissions or restore a valid backup, then request another read. Do not delete or clear the record: it contains information needed to restore permissions.",
  "重新读取管理记录": "Read the ownership record again",
  "已请求重新读取。请稍后重新查看诊断报告；文件仍不可读时会继续暂停同步。": "Another read has been requested. Refresh diagnostics shortly. Sync will remain paused if the file is still unreadable.",
  "Magpie 模型导出暂不可读，期望模型尚未确认。": "The Magpie model export is unreadable. The desired model is not yet known.",
  "Magpie 当前未连接 Ducoro，模型同步将按断开连接设置处理。": "Magpie is not connected to Ducoro. Model sync will follow the disconnection setting.",
  "Bot 列表无法读取，无法确认影响范围。": "The Bot list could not be read. The affected scope is unknown.",
  "全局资源": "Global resources",
  "{0}：指定的{1}当前不可用，相关同步将保留现状或等待重试。": "{0}: the assigned {1} are unavailable. Related sync will keep current settings or wait for a retry.",
  "旧版连接器管理记录缺少资源名称，部分移除操作只能在同步时确认。": "Legacy connector ownership records lack resource names. Some removals can only be confirmed during sync.",
  "资源库暂不可读：连接器与技能的变更预览不可用。": "The library is unreadable. Connector and skill changes cannot be previewed.",
  "工具权限已在 Ducoro 修改，现有权限会保留。": "Tool permissions were changed in Ducoro. Current permissions will be kept.",
  "需要在 Ducoro 连接此账户。": "Connect this account in Ducoro first.",
  "账户工具命令暂不可用。": "Account tool commands are unavailable.",
  "{0}：Bot 已不存在，账户分配无法执行。": "{0}: this Bot no longer exists. Account assignments cannot be applied.",
  "已启用试运行：保存后不会执行写入。": "Dry run is enabled. Saving will not perform writes.",
  "指令与子代理设置也有变化；具体内容及本地运行条件需在同步诊断中核实。": "Instruction or subagent settings have also changed. Check Sync diagnostics for content and local runtime requirements.",
  "此预览核对资源分配范围、模型与账户工具权限。资源内容更新、同名冲突、模型能力和运行中会话加载情况将在同步时再次校验。": "This preview checks resource scopes, models and account tool permissions. Resource content, name conflicts, model capabilities and loading in active sessions will be checked again during sync.",
  "管理记录版本未知，请恢复兼容的备份后重新读取。": "The ownership record version is unknown. Restore a compatible backup, then request another read.",
  "管理记录暂时无法读取；已暂停同步，请检查文件权限后重新读取。": "The ownership record cannot be read. Sync is paused. Check file permissions, then request another read.",
  "管理记录已损坏；原文件已保留，请恢复备份后重新读取。": "The ownership record is damaged. The original file is kept. Restore a backup, then request another read.",
  "管理记录已损坏，同步已暂停，原文件已保留。": "The ownership record is damaged. Sync is paused and the original file is kept.",
  "恢复 state.json 的有效备份后，点击重新读取管理记录。不要删除或清空原记录。": "Restore a valid backup of state.json, then select “Read the ownership record again”. Do not delete or clear the original record.",
  "管理记录版本未知，同步已暂停。": "The ownership record version is unknown. Sync is paused.",
  "使用兼容的插件版本，或恢复兼容备份后重新读取管理记录。": "Use a compatible plugin version, or restore a compatible backup and request another read.",
  "管理记录暂时无法读取，同步已暂停。": "The ownership record cannot be read. Sync is paused.",
  "检查文件权限和存储可用性后，点击重新读取管理记录。": "Check file permissions and storage availability, then select “Read the ownership record again”."
})

  const languageFor = value => {
    if (typeof value !== 'string') return 'en'
    try {
      const locale = new Intl.Locale(value.trim().replaceAll('_', '-'))
      if (locale.language !== 'zh' || (locale.script && !['Hans', 'Hant'].includes(locale.script))) return 'en'
      return 'zh'
    } catch { return 'en' }
  }
  function format(key, values = [], language = 'en') {
    const pattern = languageFor(language) === 'zh' ? key : ENGLISH[key] ?? key
    return pattern.replace(/\{(\d+)\}/g, (match, index) => index < values.length ? render(values[index], language) : match)
  }
  const CHINESE = Object.fromEntries(Object.entries(ENGLISH).map(([zh, en]) => [en, zh]))
  function translate(text, language = 'en') {
    if (typeof text !== 'string') return text
    const source = CHINESE[text] ?? text
    return languageFor(language) === 'zh' ? source : ENGLISH[source] ?? text
  }
  // Structured messages retain authored keys across API responses and language changes.
  const message = (key, values = []) => ({ $ducoroMessage: CHINESE[key] ?? key, values })
  const joinMessages = (values, separator = null) => ({ $ducoroList: values, separator })
  const dateTime = (value, timeOnly = false) => ({ $ducoroDate: value, timeOnly })
  function render(value, language) {
    if (value instanceof Message) return format(value.key, value.values, language)
    if (value?.$ducoroMessage && Array.isArray(value.values)) return format(value.$ducoroMessage, value.values, language)
    if (Array.isArray(value?.$ducoroList)) return value.$ducoroList.map(x => render(x, language)).join(value.separator ?? (languageFor(language) === 'zh' ? '、' : ', '))
    if (value?.$ducoroDate) {
      const date = new Date(value.$ducoroDate), locale = languageFor(language) === 'zh' ? 'zh-CN' : 'en'
      return value.timeOnly ? date.toLocaleTimeString(locale) : date.toLocaleString(locale)
    }
    return String(value)
  }
  const textBindings = new WeakMap(), attributeBindings = new WeakMap()
  class Message {
    constructor(key, values = []) { this.key = CHINESE[key] ?? key; this.values = values }
    toString() { return format(this.key, this.values, globalThis.document?.documentElement?.lang ?? 'en') }
    toJSON() { return this.toString() }
  }
  // Descriptors let language changes redraw authored text without rebuilding
  // controls or touching input values, focus, names or unsaved assignments.
  function t(strings, ...values) {
    if (strings instanceof Message) return strings
    if (strings?.$ducoroMessage && Array.isArray(strings.values)) return new Message(strings.$ducoroMessage, strings.values)
    if (Array.isArray(strings?.$ducoroList) || strings?.$ducoroDate) return new Message('{0}', [strings])
    if (typeof strings === 'string') return new Message(strings)
    const key = strings.map((part, i) => part + (i < values.length ? `{${i}}` : '')).join('')
    return new Message(key, values)
  }
  function localizedError(value) {
    const localizedMessage = t(value)
    return Object.assign(new Error(String(localizedMessage)), { localizedMessage })
  }
  function setText(el, value) {
    el.textContent = value
    if (value instanceof Message && el.firstChild) textBindings.set(el.firstChild, value)
    return value
  }
  function setAttribute(el, name, value) {
    const bindings = attributeBindings.get(el) ?? new Map()
    bindings.delete(name)
    el.setAttribute(name, value)
    if (value instanceof Message) bindings.set(name, value)
    if (bindings.size) attributeBindings.set(el, bindings)
    else attributeBindings.delete(el)
  }
  function localizeHTML(html, language) {
    const escape = text => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
    return html.replace(/(<html\b[^>]*\blang=")[^"]*(")/i, `$1${languageFor(language) === 'zh' ? 'zh-CN' : 'en'}$2`)
      .replace(/>([^<>]+)</g, (match, text) => {
        const key = text.trim()
        return Object.hasOwn(ENGLISH, key) ? '>' + text.replace(key, escape(translate(key, language))) + '<' : match
      })
      .replace(/(\b(?:aria-label|placeholder|title)=")([^"]+)(")/g, (match, before, text, after) =>
        Object.hasOwn(ENGLISH, text) ? before + escape(translate(text, language)) + after : match)
  }
  function localizeReport(report, language = 'en') {
    const issue = value => ({...value, message: translate(value.message, language), nextAction: translate(value.nextAction, language)})
    return {...report, language: languageFor(language),
      issues: (report.issues ?? []).map(issue),
      features: Object.fromEntries(Object.entries(report.features ?? {}).map(([key, value]) => [key, {...value, issues: (value.issues ?? []).map(issue)}])),
      ...(report.doctor ? {doctor: {...report.doctor, nextAction: translate(report.doctor.nextAction, language)}} : {}),
    }
  }
  // Run on authored HTML before dynamic controls are created. Repeated calls
  // use the saved source strings, never user-entered names or field values.
  const textSources = new Map(), attributeSources = new Map()
  function applyDocument(language) {
    const doc = globalThis.document
    if (!doc?.body) return
    const resolved = languageFor(language)
    doc.documentElement.lang = resolved === 'zh' ? 'zh-CN' : 'en'
    if (!textSources.size) {
      const walker = doc.createTreeWalker(doc.body, 4)
      for (let node; (node = walker.nextNode());) {
        const key = node.nodeValue.trim()
        if (Object.hasOwn(ENGLISH, key) && !node.parentElement.closest('script,style,textarea')) textSources.set(node, {key, source: node.nodeValue})
      }
      for (const el of doc.body.querySelectorAll('[aria-label],[placeholder],[title]')) {
        const entries = ['aria-label','placeholder','title'].filter(key => Object.hasOwn(ENGLISH, el.getAttribute(key))).map(key => [key, el.getAttribute(key)])
        if (entries.length) attributeSources.set(el, entries)
      }
    }
    for (const [node, {key, source}] of textSources) if (node.isConnected) node.nodeValue = source.replace(key, translate(key, resolved))
    for (const [el, entries] of attributeSources) if (el.isConnected) for (const [key, source] of entries) el.setAttribute(key, translate(source, resolved))
    const dynamicText = doc.createTreeWalker(doc.body, 4)
    for (let node; (node = dynamicText.nextNode());) if (textBindings.has(node)) node.nodeValue = textBindings.get(node).toString()
    for (const el of doc.body.querySelectorAll('*')) for (const [name, value] of attributeBindings.get(el) ?? []) el.setAttribute(name, value)
    doc.documentElement.classList.remove('language-pending')
  }
  globalThis.DucoroI18n = Object.freeze({ languageFor, format, translate, message, joinMessages, dateTime, render, t, error:localizedError, setText, setAttribute, localizeHTML, localizeReport, applyDocument, messages: Object.freeze(ENGLISH) })
})()
