# magpie-ducoro

[English](README.md) | 简体中文

一个 [magpie](https://usemagpie.ai) 插件：让 [Ducoro](https://ducoro.com) 使用 Magpie 模型，同步勾选的 MCP 服务器、技能、指令与显式选择的子代理。暂不支持 Hooks 和 RTK。

## 安装

```sh
magpie plugin add github:YE4IM/magpie-ducoro
```

在应用里：插件 → 添加插件 → 输入 `github:YE4IM/magpie-ducoro`。

## 工作原理

- `ducoro.agent.js` 在 magpie 的 Agent 页声明一行 **Ducoro**。这一行连接并选择模型后，magpie 会把网关地址、按 agent 的网关密钥和所选模型写入 `~/.ducoro/magpie-agent.json`，并把资源库勾选的 MCP 服务器写入 `~/.ducoro/magpie-mcp.json`、技能写入 `~/.ducoro/magpie-skills/`。
- `bridge.mjs`（插件主模块）监视这些文件，通过 `ducoro-cli` 让 Ducoro 保持同步——本包不直接与 Ducoro 通信。

## 0.3.2：控制台、统一诊断与按 Bot 分配资源

在 Magpie 中打开插件的 **Ducoro 控制台**，可用表单设置同步开关、目标 Bot、资源作用域、子代理名和官方模型能力参考。设置 → 插件中也会显示简要配置面板；Agent 行菜单的“Ducoro 同步诊断”会打开诊断页。保存选项由 Magpie 触发宿主重载，随后自动对账。

### 按 Bot 分配 MCP 和技能

默认仍将 MCP 和技能同步到全局。把 `mcpScope` 或 `skillsScope` 设为 `agents` 后，按 Bot 写入资源。`targetAgents` 非空时限定为明确列出的 Bot，否则使用绑定 `connectionSlug` 的适用 Bot。资源清单填写 **Magpie 资源库中的名称**，并且只有已启用、已分配给 Ducoro 的条目才会同步。

```json
{
  "mcpScope": "agents",
  "skillsScope": "agents",
  "targetAgents": ["agt-coder", "agt-writer"],
  "resourceAssignments": {
    "agt-coder": { "mcp": ["repo-tools"], "skills": ["code-review"] },
    "agt-writer": { "mcp": [], "skills": ["writing"] }
  }
}
```

省略某个 Bot 或它的 `mcp` / `skills` 字段，表示继承资源库已分配的全部对应资源；空数组 `[]` 表示不分配该类资源。控制台会明确显示这两种模式。`skillsScope` 也继续支持直接填写单个 Bot ID。关闭资源同步、取消资源勾选或缩小目标范围时，移除插件拥有的对应条目；`prune: false` 不会保留已撤销的分配。切换作用域会迁移插件管理的条目，同名的用户自建条目会保留并报告冲突。

这里的分配管理本插件创建的资源。Ducoro 中其他全局资源仍按它自身的继承规则生效，不会因为这里选择空清单而被屏蔽。

### 统一诊断

每轮同步会在 `<Magpie config>/ducoro-bridge/sync-status.json` 生成报告，覆盖连接、Bot 模型、MCP、技能、指令与子代理，包含状态、受影响 Bot 和下一步操作。支持 `DUCORO_BRIDGE_STATE_DIR` 自定义报告目录。

在本插件文件夹中运行：

```sh
npm run diagnostics
npm run diagnostics -- --json
npm run diagnostics -- --doctor
node diagnostics-cli.mjs --json > /tmp/ducoro-sync-status.json
```

诊断命令只读；`--doctor` 检查 CLI 和守护进程，不运行模型请求、不自动重启会话。将生成的 JSON 导入控制台“诊断”页，即可查看快照及生成时间。Magpie 的公开页面接口不能直接读取本地报告，因此页面不会自动获取实时状态，也不会将诊断内容写入插件选项。报告缺失、过期、部分失败和未完成检查会明确标示；“已配置”只代表配置层状态，运行中会话是否已加载保持“未知”。

公开新增选项：

| 选项 | 默认 | 含义 |
| --- | --- | --- |
| `mcpScope` | `global` | `global` 或 `agents`。 |
| `skillsScope` | `global` | `global`、`agents` 或单个 Bot ID。 |
| `resourceAssignments` | `{}` | Bot ID → MCP / 技能名称清单；字段省略继承，空数组不分配。 |

配置校验失败时会停止同步并报告待修正的字段，避免把错误清单解释为全部资源。

## 模型同步

*0.3.1 新增。*

无需改变 Magpie 的模型选择或路由组配置。插件继续原样发送所选 ID（包括 `group/...`），由 Magpie 决定上游供应商。

在 `syncConnection` 和 `syncAgentModels` 开启（默认）时：

- 绑定本连接、且使用旧默认模型的 Bot 会跟随 Magpie 的新选择；仍在连接模型列表里的其他自选模型保持不变。
- 升级时和每次对账时，绑定 Bot 的模型若已不在非空的连接目录里，会被修复为当前默认选择。包括 0.3.0 中切换到 `group/glm-5.3-flash` 后遗留的 `group/never-stuck`。
- 所有导出的模型和路由组各自独立解析能力参考，优先官方目录供应商。只有 Ducoro 的有效能力投影支持时才保留显式思考档位，否则 Bot 使用模型默认思考行为。模型变化时速度覆盖也会清除，因为连接投影不校验它们。
- 只处理已绑定 `connectionSlug` 的 `pi-agent` Bot；`targetAgents` 非空时进一步限定范围。其他连接和运行时不受影响。设 `syncAgentModels: false` 可保留连接同步、不改动 Bot 偏好。
- 连接创建/更新必须成功并回读之后才更新 Bot。默认值变更先于连接变更保存，失败的 Bot 更新在重启后重试。每次 Bot 更新都回读校验。

改动在 Bot 下一轮经 Ducoro 正常的模型寻址逻辑时生效。插件不打断运行、不重启参与者、不重放失败消息。升级后，请重发之前失败的消息。

## 官方模型参考与路由组

插件读取 Ducoro 实时的 `connections catalog`，写入 `modelCapabilityRefs`——即连接编辑器里 **“这个模型类似哪一款？”** 的设置。同步后重新打开编辑器即可看到保存的值。线路 ID、端点地址和 Magpie 的路由决策都保持原样。

- 处理 Magpie 导出的允许模型列表里的全部模型/组，不只当前默认项。例如同质的 GLM 组可参考 `zai/glm-5.3-flash`，Kimi K3 组参考 `kimi-coding/k3`。
- 内置官方供应商优先级，包括 `zai`、`zai-coding-cn`、`kimi-coding`、`moonshotai`、`moonshotai-cn`、`anthropic`、`openai`、`google`、`deepseek` 等。只使用 Ducoro 实际返回的坐标；`officialProviders` 可替换这份有序优先表。
- 模型名在归一化大小写、空格、下划线和连字符后匹配。Kimi 的 `k3` 与 `kimi-k3` 识别为同一身份；版本、日期和变体保持区分：`k3.1-pro` 不会映射到 `k3`，`k3-256k` 不会映射到全长上下文的 K3。不支持的身份需要显式覆盖。
- 路由组成员来自 Magpie 本地的 `providers.json`，成员能力由 `plugin-providers.json` 和 Agent 导出补充。组名不会覆盖实际成员。支持嵌套组；循环、未知成员、缺失/空成员表都会上报。没有成员表的自动生成组不做猜测。
- 同质组在已知成员上限不冲突时获得自动官方参考。报告包含最小已知上下文上限和共同的思考/图像/工具能力；未知信息标为不完整。已知上下文/思考上限窄于参考时会阻止自动映射；其他成员差异以警告上报。
- 混合模型组不生成新的自动参考；组变混合时，本版本管理的旧参考会被移除。显式手动映射保留并上报待审。Ducoro 的参考接口表达不了任意能力交集：报告只作诊断，不会安装自定义能力配置。
- 自动映射落盘后，手动编辑和清除参考会被记住。首次升级时，等价的非官方遗留映射（如 `opencode/glm-5.3-flash`）迁移到官方条目；其余现有映射视为手动。没有历史来源可区分遗留自动映射与相同内容的旧手动选择；想保留确切条目，就显式固定 `modelCapabilityRefs`。
- 两个元数据文件都被监视，因此组成员变化可以更新映射/报告，而不必改动 Magpie 选中的模型。元数据缺失或目录不可用时保留现有参考以便恢复，不会凭空发明新映射。路由更新与映射来源一起记账，重试/重启不会把成功写入误判为手动编辑。

警告出现在插件日志。详细报告保存在 `<Magpie config>/ducoro-bridge/model-capabilities.json`（或 `DUCORO_BRIDGE_STATE_DIR` 下），记录每条路由的状态、映射来源、成员、候选、共同能力与警告。`applied: false` 表示提议的路由更新尚未核实。报告不含供应商凭据、账号数据或端点地址。

显式参考使用与 Ducoro 相同的目录坐标：

```json
{
  "modelCapabilityRefs": {
    "group/glm-5.3-flash": "zai/glm-5.3-flash",
    "kimi/k3": "kimi-coding/k3",
    "group/mixed": null
  }
}
```

`null` 值禁用该路由的自动映射。显式参考也必须存在于 Ducoro 目录中，并优先于自动或记住的手动选择。为混合/别名模型设置参考前，请先确认其宣称的能力适用。

配置不在标准位置时，把 `DUCORO_BRIDGE_PROVIDERS_FILE` 和 `DUCORO_BRIDGE_PLUGIN_PROVIDERS_FILE` 指向 Magpie 对应的元数据文件。

## 选项

用 `magpie plugin options magpie-ducoro '<json>'` 或在应用的插件选项里设置：

| 选项 | 默认 | 含义 |
| --- | --- | --- |
| `connectionSlug` | `magpie-ducoro` | Ducoro 连接的 slug。 |
| `syncConnection` | `true` | 同步网关连接。 |
| `syncAgentModels` | `true` | 模型变化后对账绑定的 Bot 并修复失效的模型 ID；需要 `syncConnection`。 |
| `officialProviders` | 内置有序列表 | 自动能力匹配优先使用的 Ducoro 官方目录供应商。 |
| `modelCapabilityRefs` | `{}` | 显式的路由 → 目录参考覆盖；`null` 禁用该路由的映射。 |
| `syncMcp` | `true` | 同步勾选的 MCP 服务器。 |
| `syncSkills` | `true` | 同步勾选的技能。 |
| `skillsScope` | `global` | 同步技能的作用域。 |
| `prune` | `true` | 移除不再勾选的条目。 |
| `onDisconnect` | `keep` | 断开连接后已同步状态的处理方式。 |
| `syncInstructions` | `true` | 同步指令。 |
| `syncSubagents` | `true` | 同步显式选择的子代理。 |
| `targetAgents` | `[]` | 只同步这些 agent。 |
| `subagentNames` | `[]` | 要同步的显式选择的子代理名。 |

## 验证记录

发布前已通过 114 项隔离测试。本精简发布源码不包含测试目录和开发过程文档。

## 相关文档

- 版本历史：[CHANGELOG.md](CHANGELOG.md)

## 许可证

MIT
