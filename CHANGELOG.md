# 更新记录

## 0.3.2 — 2026-11-06

**中文**

magpie-ducoro 0.3.2 新增可视化控制台，可直接管理同步选项、目标 Bot 和模型能力映射，并按 Bot 分配 MCP 与技能。统一诊断报告与只读诊断命令帮助查看同步状态、失败原因和处理建议，控制台支持导入报告快照。新版延续 0.3.1 的模型同步能力，默认保留全局资源同步，并加强配置校验与作用域迁移处理。

**English**

magpie-ducoro 0.3.2 introduces a visual console for managing sync settings, target Bots and model capability mappings, with per-Bot MCP and skill assignment. Unified reports and a read-only diagnostics command make sync status, failures and next steps easier to inspect; report snapshots can be imported into the console. This release retains 0.3.1 model synchronization and global resource sync by default, while strengthening configuration validation and scope migration handling.

- 新增 Magpie 内的 Ducoro 可视化配置页面、设置面板和 Agent 菜单诊断入口。
- 新增统一同步报告及只读诊断命令，分别呈现配置状态、失败原因、目标 Bot 和后续操作；运行时加载状态保持明确未知。
- 新增按 Bot 分配 MCP / 技能；支持继承与空清单、目标范围限制、作用域迁移和旧版全局状态升级。
- 新增配置校验，错误的作用域或资源清单会阻止同步，避免扩大资源访问。
- 保留默认全局同步和 0.3.1 模型同步行为。页面通过导入 JSON 查看诊断快照；Magpie 暂未提供读取本地报告的公开页面接口。

验证采用临时目录、模拟 Ducoro CLI 和页面桥接，不修改真实配置、不调用 LLM。

## 0.3.1 — 2026-11-06

新增模型与路由组的自动同步和官方能力映射：保持 Magpie 原有的模型选择与路由方式，
为每个单模型和路由组分别识别模型身份，优先使用 z.ai、Kimi Coding 等官方目录条目
填充 Ducoro 的“这个模型类似哪一款？”。切换默认模型时，关联 Bot 会自动跟随，
并修复失效的旧模型 ID；支持的思考档位会保留。对于混合模型组、未知版本和已知能力
超限，插件提供原因、候选及能力差异报告，避免错误匹配。同时支持手动指定或禁用
映射、组成员变化监听、失败重试及重启恢复。

验证：57 项隔离测试通过；Ducoro 实机验证了 GLM 路由组和单模型对话、旧 Bot 修复及
官方参考保存，两次真实对话均成功，测试后已恢复原 GLM 路由组。

限制：自动匹配以 Ducoro 当前目录和可读取的组成员为依据；无法确认的版本不会降级
匹配。混合组的共同能力仅作诊断，不能通过现有参考接口写成任意自定义能力配置。

详情见 [README](README.md)。
