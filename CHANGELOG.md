# 更新记录

## 0.3.5 — 2026-11-06

0.3.5 精简 Magpie 已安装列表中的插件说明：保留 Agent 接入和侧边栏 Ducoro 配置页，取消重复的设置面板与 Agent 菜单诊断入口，正常状态下由四行功能说明减少为两行。同步开关、Bot 资源分配和实时诊断统一从侧边栏配置页使用，插件中英文摘要均精简为一句话。

Version 0.3.5 reduces the normal Installed-row description from four lines to two by keeping Agent integration and the Ducoro sidebar page while removing the redundant Settings panel and Agent diagnostics menu entry. Sync settings, Bot resource assignments and live diagnostics remain on the sidebar page. Both English and Chinese plugin summaries are shortened to one sentence. The interface now follows Magpie automatically: Chinese for Simplified or Traditional Chinese, English for all other or unknown languages, with no manual language switch. Live language changes preserve unsaved settings and assignments.

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
