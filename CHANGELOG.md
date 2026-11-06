# 更新记录

## 0.3.4 — 2026-11-06

0.3.4 带来全新的可视化配置页面，将模型、连接器与技能集中管理，并自动列出 Bot，支持全局同步或按 Bot 单独分配。模型可跟随 Magpie 默认设置，也可为指定 Bot 固定选择；连接器同时支持 Magpie 资源库与 Ducoro 账户来源，账户工具按 Bot 显式授权，撤销分配时恢复原有策略。新版还提供统一同步诊断、失败重试及配置校验，刷新页面时保留未保存的选择，让配置与排查更方便。

Version 0.3.4 introduces a new visual configuration page that brings models, connectors, and skills together, automatically lists your Bots, and supports global synchronization or individual Bot assignments. Models can follow the Magpie default or stay pinned to a specific choice. Connectors support both the Magpie library and Ducoro accounts, with explicit per-Bot permissions for account tools and restoration of previous policies when assignments are removed. Unified sync diagnostics, retries, configuration validation, and preservation of unsaved selections during refresh make setup and troubleshooting easier.

- 实机修复：允许 Magpie 桌面端页面来源，解决服务页面空白；增加回归断言。
- 实机修复：账户分配优先显示已连接服务，未连接状态给出明确提示；加载期间锁定新生成的资源控件。
- 实机验证：真实 Bot 模型切换、连接器与技能分配、撤销和恢复通过，已恢复测试前模型及全局同步方式。

- 侧边栏和页面标题统一为 Ducoro；界面工具资源统一称为“连接器”。
- 作用域及 Bot 卡片按“模型、连接器、技能”三列排列，窄屏自动纵向排列。
- 通过插件本地页面服务自动读取所有 Bot、模型、资源库及账户连接器目录。
- 模型支持全局跟随与按 Bot 单独指定；独立模型不会被全局默认模型变化覆盖。
- 连接器和技能以勾选列表分配；账户连接器按 Bot 指定具体允许工具。
- 连接器撤销恢复原有用户策略，检测外部编辑，支持结果未知时再次核实。
- 页面可刷新同步报告、重试同步，保留原有报告导入入口。
- 使用 Magpie 正式页面消息通道保存选项，不额外维护设置副本。
- 9 项自动测试通过；模拟浏览器检查覆盖刷新后保留选择与完整保存。

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
