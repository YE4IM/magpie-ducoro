<a href="https://opc.fish"><picture><source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/YE4IM/readme/main/project%20readme/assets/opc-fish-project-signature-web-dark.svg"><img src="https://raw.githubusercontent.com/YE4IM/readme/main/project%20readme/assets/opc-fish-project-signature.svg" alt="OPC.FISH Project" width="720"></picture></a>

# magpie-ducoro

[**English**](./README.md) | [中文](./README-zh-CN.md)

Sync Magpie models, connectors, skills, instructions, and selected subagents to Ducoro from the Magpie plugin page.

[![npm version](https://img.shields.io/npm/v/magpie-ducoro)](https://www.npmjs.com/package/magpie-ducoro) [![MIT license](https://img.shields.io/github/license/YE4IM/magpie-ducoro)](./LICENSE)

[Quick start](#quick-start)

## Overview

Use Magpie's default model in Ducoro or configure individual Bots. Review the changes before saving and check which settings Ducoro wrote, read back, and loaded into a session.

## Requirements

- Magpie with support for plugin agents and page services (`magpie.agent` and `magpie.page.service`). [Magpie](https://usemagpie.ai)
- Ducoro installed and signed in, with its background service running and access to the local device and Bots you want to manage. [Ducoro](https://ducoro.ai)
- `ducoro-cli` on the `PATH` used to launch Magpie. [Download the Ducoro CLI](https://ducoro.ai/download/cli)

## Installation

In Magpie, open **Plugins → Add a plugin** and enter `magpie-ducoro@0.4.10`, or use the Magpie CLI.

```bash
magpie plugin add magpie-ducoro@0.4.10
```

If you already downloaded the npm package, use one of these Magpie entry points to register it. [npm package](https://www.npmjs.com/package/magpie-ducoro)

<details>
<summary>Install from source</summary>

Download and extract a release, then add the absolute path to the extracted folder in Magpie. You can also add the GitHub ref `github:YE4IM/magpie-ducoro#v0.4.10`. [GitHub Releases](https://github.com/YE4IM/magpie-ducoro/releases)

</details>

## Quick start

1. In Magpie, connect **Ducoro** from the **Agent** page and select a model. Then open **Ducoro** in the sidebar.
2. Open **Sync settings** and review the connection slug, enabled resource types, and target Bots. Use **Bot resources** for individual assignments.
3. Select **Preview changes** to review additions and removals. Select **Preview and save** and confirm to save the settings and start synchronization.
4. Open **Sync status** to check whether settings were saved, written, read back, and loaded into a session. Review any unverified items there.

Plugin registration and the end-to-end sync workflow require a configured Magpie and Ducoro installation and were unverified in the documentation check.

## Usage

- **Models** can follow Magpie's default or be assigned per Bot. The plugin matches model capabilities against Ducoro's catalog, with manual overrides available.
- **Connectors and skills** can be assigned globally or per Bot. An empty per-Bot list clears this plugin's assignments for that resource type, while resources from other sources stay available. For Ducoro account connectors, connect the service in Ducoro first and select the allowed tools for each Bot.
- **Instructions and subagents** sync to the selected targets. Instructions are written to a plugin-managed block. Subagents require explicit selection.
- **Plans** share model, connector, skill, and instruction settings across Bots. Individual overrides take precedence over inherited values.
- **Backup and restore** provides management-record backups and configuration checkpoints. After restoring management records, select **Preview impact and resume sync** to review the changes and resume synchronization.

Use the published package to request a read-only live report. The `--doctor` flag also checks the Ducoro background service. Use `--lang zh` for Chinese or `--json` for structured output.

```bash
npm exec --package=magpie-ducoro@0.4.10 -- magpie-ducoro-status --doctor
```

The plugin page follows Magpie's language. Simplified and Traditional Chinese use Chinese. Other languages use English.

## Configuration

| Option | Default | Purpose |
| --- | --- | --- |
| `connectionSlug` | `magpie-ducoro` | ID of the Ducoro model connection |
| `servicePort` | `3487` | Page-service port on `127.0.0.1` |
| `modelScope`, `mcpScope`, `skillsScope` | `global` | Use `agents` for per-Bot assignments |
| `targetAgents` | `[]` | Restrict model, instruction, subagent, and per-Bot library resource sync to selected Bots |
| `botModels` | `{}` | Model selections by Bot ID |
| `resourceAssignments` | `{}` | Library connector and skill selections by Bot ID |
| `accountConnectors` | `{}` | Allowed and denied account connector tools by Bot ID and connector slug |
| `modelCapabilityRefs` | `{}` | Manual references to model capabilities |
| `subagentNames` | `[]` | Explicitly selected subagents |

Management records default to `~/.config/magpie/ducoro-bridge/state.json`. The plugin uses `DUCORO_BRIDGE_STATE_DIR` when set, or the `magpie/ducoro-bridge` subdirectory of `XDG_CONFIG_HOME` when available.

## Troubleshooting

- **The page fails to load.** Check that Magpie can find `ducoro-cli`, the Ducoro service is running, and the configured `servicePort` is available.
- **Sync pauses because management records are unreadable.** Keep the original `state.json` and its journal. Open **Backup and restore**, review a valid backup, and use the resume review after restoring.
- **A sync lock remains after shutdown.** Stop all plugin hosts, then run the inspection command from a checkout. The command reports the lock owner and any available recovery instructions.

```bash
npm run lock:inspect -- /absolute/path/to/ducoro-bridge
```

Before switching versions, stop the current plugin host. If you are downgrading, merge the journal into the snapshot from the current version's directory before loading the older version.

```bash
npm run state:compact -- /absolute/path/to/state.json
```

## Changelog

[Version history](./docs/CHANGELOG.md) · [Latest release notes](./docs/RELEASE-NOTES.md) · [GitHub Releases](https://github.com/YE4IM/magpie-ducoro/releases)

## License

MIT. See [LICENSE](./LICENSE).
