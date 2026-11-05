# magpie-ducoro

A [magpie](https://usemagpie.ai) plugin that connects [Ducoro](https://ducoro.com) to Magpie models and syncs assigned MCP servers, skills, instructions and explicitly selected subagents. Hooks and RTK are not supported.

让 Ducoro 使用 Magpie 模型，同步勾选的 MCP、技能与指令，并支持显式选择的子代理；暂不支持 Hooks 和 RTK。

## Install

```sh
magpie plugin add github:YE4IM/magpie-ducoro
```

In the app: Plugins → Add plugin → enter `github:YE4IM/magpie-ducoro`.

## How it works

- `ducoro.agent.js` declares a **Ducoro** agent row on magpie's Agent page. When the row is connected and a model is picked, magpie writes the gateway URL, the per-agent gateway key and the selected model to `~/.ducoro/magpie-agent.json`, plus the library's MCP servers to `~/.ducoro/magpie-mcp.json` and library skills to `~/.ducoro/magpie-skills/`.
- `bridge.mjs` (the plugin main module) watches those artifacts and keeps Ducoro in sync through `ducoro-cli` — nothing in this package talks to Ducoro directly.

## Options

Set with `magpie plugin options magpie-ducoro '<json>'` or in the app's plugin options:

| Option | Default | Meaning |
| --- | --- | --- |
| `connectionSlug` | `magpie-ducoro` | Slug of the Ducoro connection. |
| `syncConnection` | `true` | Sync the gateway connection. |
| `syncMcp` | `true` | Sync assigned MCP servers. |
| `syncSkills` | `true` | Sync assigned skills. |
| `skillsScope` | `global` | Scope for synced skills. |
| `prune` | `true` | Remove entries no longer assigned. |
| `onDisconnect` | `keep` | What happens to synced state when disconnected. |
| `syncInstructions` | `true` | Sync instructions. |
| `syncSubagents` | `true` | Sync explicitly selected subagents. |
| `targetAgents` | `[]` | Restrict sync to these agents. |
| `subagentNames` | `[]` | Explicitly selected subagent names to sync. |

## License

MIT
