# magpie-ducoro

English | [简体中文](README.zh-CN.md)

A [magpie](https://usemagpie.ai) plugin that connects [Ducoro](https://ducoro.com) to Magpie models and syncs assigned MCP servers, skills, instructions and explicitly selected subagents. Hooks and RTK are not supported.

## Install

```sh
magpie plugin add github:YE4IM/magpie-ducoro
```

In the app: Plugins → Add plugin → enter `github:YE4IM/magpie-ducoro`.

## How it works

- `ducoro.agent.js` declares a **Ducoro** agent row on magpie's Agent page. When the row is connected and a model is picked, magpie writes the gateway URL, the per-agent gateway key and the selected model to `~/.ducoro/magpie-agent.json`, plus the library's MCP servers to `~/.ducoro/magpie-mcp.json` and library skills to `~/.ducoro/magpie-skills/`.
- `bridge.mjs` (the plugin main module) watches those artifacts and keeps Ducoro in sync through `ducoro-cli` — nothing in this package talks to Ducoro directly.

## 0.3.2: console, unified diagnostics and per-Bot resources

Open the plugin's **Ducoro** page in Magpie to configure sync switches, target Bots, resource scopes, selected subagents and model capability references. A compact panel is also available under Settings → Plugins. The Agent context-menu diagnostics action opens this page. Saving uses Magpie's options bridge, which reloads the host and reconciles the configuration.

### Per-Bot MCP and skills

Global synchronization remains the default. Set `mcpScope` or `skillsScope` to `agents` for Bot-local definitions. A non-empty `targetAgents` selects explicit Bots; otherwise eligible Bots bound to `connectionSlug` are used. Resource lists use **Magpie library names**, always intersected with enabled resources assigned to Ducoro.

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

Omitting a Bot or its `mcp` / `skills` field inherits all library-selected resources of that type. `[]` assigns none. The UI makes this distinction explicit. A single Bot ID remains a supported `skillsScope`. Disabling synchronization, deselecting a resource or narrowing the target roster revokes plugin-owned entries even with `prune: false`. Scope changes migrate owned definitions; user-owned collisions are retained and reported.

Assignments manage this plugin's resources. Other global Ducoro resources continue to follow Ducoro's inheritance rules; an empty assignment does not mask them.

### Unified diagnostics

Each synchronization writes `<Magpie config>/ducoro-bridge/sync-status.json`, covering the connection, Bot models, MCP, skills, instructions and subagents with statuses, affected Bots and next actions. `DUCORO_BRIDGE_STATE_DIR` overrides the directory.

From this plugin folder:

```sh
npm run diagnostics
npm run diagnostics -- --json
npm run diagnostics -- --doctor
node diagnostics-cli.mjs --json > /tmp/ducoro-sync-status.json
```

The command is read-only. `--doctor` checks the CLI and daemon without LLM requests or participant restarts. Import the JSON into the console's diagnostics view to inspect the timestamped snapshot. Magpie's public page API cannot read local reports, so the console does not claim live status or store diagnostics in plugin options. Missing, stale, partial and unchecked results remain explicit. Configured means configuration-level evidence; running-session loading remains unknown.

| New / extended option | Default | Meaning |
| --- | --- | --- |
| `mcpScope` | `global` | `global` or `agents`. |
| `skillsScope` | `global` | `global`, `agents` or one Bot ID. |
| `resourceAssignments` | `{}` | Bot ID → MCP / skill name lists; omitted inherits, empty assigns none. |

Invalid settings stop synchronization and identify fields to correct instead of treating malformed selections as unrestricted inheritance.

## Model synchronization

*Added in 0.3.1.*

Magpie's model picker and routing groups keep working as before. The plugin continues sending the exact selected ID, including `group/...`; Magpie chooses the upstream provider.

With `syncConnection` and `syncAgentModels` enabled (the defaults):

- Bots bound to this connection and using its previous default follow the new Magpie selection. A different model that is still in the connection's model list keeps its selection.
- On upgrade and every reconciliation, a bound Bot whose model is no longer in the non-empty connection catalog is repaired to the selected default. This includes `group/never-stuck` left behind after switching to `group/glm-5.3-flash` in 0.3.0.
- Capability references are resolved independently for all exported models and routing groups, with official catalog providers preferred. Explicit thinking levels are retained only when Ducoro's effective capability projection supports them; otherwise the Bot uses the model's default thinking behavior. On a model change, speed overrides are also cleared because the connection projection does not verify them.
- Only `pi-agent` Bots already bound to `connectionSlug` are reconciled. `targetAgents`, when non-empty, further restricts that set. Other connections and runtimes are untouched. Setting `syncAgentModels: false` opts out of Bot preference changes while retaining connection sync.
- Connection creation/updates must succeed and be read back before Bot updates. Default transitions are saved before connection changes, and failed Bot updates are retried after restarts. Each Bot update is read back for verification.

Changes take effect on the Bot's next run through Ducoro's normal model-address handling. The plugin does not interrupt runs, restart participants, or replay failed messages. After upgrading, resend a message that previously failed.

## Official model references and routing groups

The plugin reads Ducoro's live `connections catalog` and writes `modelCapabilityRefs`, the setting shown as **"这个模型类似哪一款？"** in the connection editor. Reopen the editor after synchronization to see saved values. Wire IDs, endpoint URLs, and Magpie's routing decisions are preserved.

- All models/groups in Magpie's exported allowed model list are processed, not just the selected default. For example, a homogeneous GLM group can reference `zai/glm-5.3-flash` while a Kimi K3 group references `kimi-coding/k3`.
- Official provider preference is built in, including `zai`, `zai-coding-cn`, `kimi-coding`, `moonshotai`, `moonshotai-cn`, `anthropic`, `openai`, `google`, `deepseek` and others. Only coordinates actually returned by Ducoro are used. `officialProviders` can replace the ordered preference list.
- Model names are matched after normalizing case, spaces, underscores and hyphens. Kimi's `k3` and `kimi-k3` are recognized as the same identity. Versions, dates and variants remain distinct: `k3.1-pro` is not mapped to `k3`, and `k3-256k` is not mapped to the full-context K3 model. Unsupported identities require an explicit override.
- Routing-group membership comes from Magpie's local `providers.json`, with member capabilities supplemented by `plugin-providers.json` and the Agent export. Group labels never override actual members. Nested groups are supported; cycles, unknown members and absent/null membership are reported. Opaque automatically generated groups without a member list are not guessed.
- Homogeneous groups get an automatic official reference when known member limits do not conflict with it. The report includes the smallest known context limit and common thinking/image/tool capabilities. Unknown information is marked incomplete. Known context/thinking limits narrower than the reference block automatic mapping; other member differences are reported as warnings.
- Mixed-model groups have no new automatic reference. An old reference managed by this version is removed if the group becomes mixed. Explicit manual mappings are retained and reported for review. Ducoro's reference API cannot express an arbitrary capability intersection; the report is diagnostic and does not install a custom capability profile.
- Manual edits and clearing a reference are remembered after automatic mapping has been recorded. On first upgrade, equivalent non-official legacy mappings such as `opencode/glm-5.3-flash` are migrated to an official entry; other existing mappings are treated as manual. There is no historical provenance to distinguish a legacy automatic mapping from an identical old manual choice; pin `modelCapabilityRefs` explicitly if you want to keep that exact entry.
- Both metadata files are watched, so changing group members can update the mapping/report without changing Magpie's selected model. Missing metadata or a catalog outage retains existing references for recovery; it does not invent a new mapping. Route updates and mapping provenance are journaled together so retries/restarts do not misclassify a successful write as a manual edit.

Warnings appear in the plugin log. A detailed report is saved at `<Magpie config>/ducoro-bridge/model-capabilities.json` (or under `DUCORO_BRIDGE_STATE_DIR`). It records each route's status, mapping source, members, candidates, common capabilities and warnings. `applied: false` means the proposed route update has not yet been verified. It contains no provider credentials, account data or endpoint URLs.

Explicit references use the same catalog coordinates as Ducoro:

```json
{
  "modelCapabilityRefs": {
    "group/glm-5.3-flash": "zai/glm-5.3-flash",
    "kimi/k3": "kimi-coding/k3",
    "group/mixed": null
  }
}
```

A `null` value disables automatic mapping for that route. An explicit reference still needs to exist in Ducoro's catalog. It takes precedence over automatic or remembered manual choices. Only set a reference for a mixed/aliased model after checking that its advertised capabilities are appropriate.

For nonstandard config locations, set `DUCORO_BRIDGE_PROVIDERS_FILE` and `DUCORO_BRIDGE_PLUGIN_PROVIDERS_FILE` to Magpie's corresponding metadata files.

## Options

Set with `magpie plugin options magpie-ducoro '<json>'` or in the app's plugin options:

| Option | Default | Meaning |
| --- | --- | --- |
| `connectionSlug` | `magpie-ducoro` | Slug of the Ducoro connection. |
| `syncConnection` | `true` | Sync the gateway connection. |
| `syncAgentModels` | `true` | Reconcile bound Bots after model changes and repair obsolete model IDs; requires `syncConnection`. |
| `officialProviders` | Built-in ordered list | Preferred official Ducoro catalog providers for automatic capability matching. |
| `modelCapabilityRefs` | `{}` | Explicit route → catalog reference overrides; `null` disables mapping for a route. |
| `syncMcp` | `true` | Sync assigned MCP servers. |
| `syncSkills` | `true` | Sync assigned skills. |
| `skillsScope` | `global` | Scope for synced skills. |
| `prune` | `true` | Remove entries no longer assigned. |
| `onDisconnect` | `keep` | What happens to synced state when disconnected. |
| `syncInstructions` | `true` | Sync instructions. |
| `syncSubagents` | `true` | Sync explicitly selected subagents. |
| `targetAgents` | `[]` | Restrict sync to these agents. |
| `subagentNames` | `[]` | Explicitly selected subagent names to sync. |

## Validation

Before release, 114 isolated tests passed. This trimmed source distribution omits the test suite and development-only documentation.

## Notes

- Version history: [CHANGELOG.md](CHANGELOG.md)

## License

MIT
