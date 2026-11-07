# Ducoro 0.4.2

Sync Magpie models, connectors, skills, instructions and explicitly selected subagents to Ducoro. Manage assignments for individual Bots from the plugin page.

## Installation

Add this folder's absolute path in Magpie's plugin settings, or install the local `magpie-ducoro-0.4.2.tgz` package. Open **Ducoro** in the sidebar. Magpie must support plugin page services, and `ducoro-cli` and the Ducoro daemon must be available locally.

Replace the previous plugin path or package when upgrading. Keep existing management records and assignments; do not enable two versions simultaneously.

## What's new

- Read configuration back after saving. Results distinguish verified, failed, unverified and skipped items. Rechecking is read-only and does not replay timed-out writes. Models and account policies support read-back; resource contents, skills, instructions and subagents remain unverified where evidence is incomplete.
- Search Bots by name or ID, filter their status and see unsaved changes. Copy model, library connector and skill assignments to selected Bots after reviewing the affected targets. Copies change the draft; preview and save to apply. Account permissions are excluded.
- Jump from diagnostics to the relevant settings. Inspect model matching sources, reasons and capability differences.
- Preview content changes for resources with unchanged names, skill files and instructions. Unreadable content remains explicitly unverified.
- Keep a bounded set of valid management backups, validate and preview them before restoring, or delete individual backups after confirmation. Deleting a backup does not change current records or Bot configuration.
- English and Chinese presentation. Original Bot, model, resource and tool names and technical option keys are preserved.

Configuration verification does not prove that a running session has loaded the changes.

## Preview and assignments

**Preview changes** reads the draft without writing. **Save settings** first shows a preview and requires confirmation. The preview includes global and Bot additions and removals, and the impact on other Pi Agent Bots when moving from global resources to Bot assignments. It shares the synchronization planner, but cannot guarantee execution success or runtime loading. Ownership is based on plugin records, not user-installed resources.

The model, connector and skill scopes are independent. A scope switch enables assignment by Bot; turning it off selects global synchronization. Bot names and IDs are read-only. Refresh retains unsaved choices, removes deleted Bot draft entries only after a successful list read, and never treats a failed read as an empty list.

Models apply to Pi Agent Bots bound to the plugin connection. Global mode follows the Magpie default; Bot mode permits an override or inheritance. Unavailable models retain their previous setting and produce a pending result. Other runtimes and connection bindings are not changed automatically.

Connectors have two sources:

- **Magpie**: enabled library connectors assigned to Ducoro. These can be global or assigned to Pi Agent Bots.
- **Ducoro**: account connectors configured in the Bot's account drawer. Connect the service in Ducoro first, then explicitly select allowed tools for each Bot. Closing the drawer retains the draft; save the page to apply.

Library connectors and skills support inheritance, explicit selection and no assignment. Empty lists mean the plugin assigns none; they do not block other global or user configurations. Explicit resource selections can include Pi Agent Bots that are not bound to the plugin model connection.

The first explicit account assignment records the previous policy. Revocation restores that policy, or removes a previously absent entry. External edits cause conflicts instead of being overwritten. Choose to keep Ducoro's current policy or reapply Magpie's policy, then preview and save. Conflict decisions are bound to the observed permissions and record revision; another external change invalidates them. Account availability also depends on pairing, service connection and runtime support. Revocations run before additions across Bots, and connector failures are isolated.

## Language

The page follows the Magpie language setting: Simplified and Traditional Chinese use Chinese; all other and unknown languages fall back to English. Language changes preserve drafts, search, selections and open dialogs. Names and technical keys retain their original spelling. The diagnostics command defaults to English; pass `--lang zh` for Chinese or `--lang en` explicitly. JSON uses the selected language for presentation while retaining identifiers and structured configuration facts.

## Model capability catalog

Automatic matching uses the official catalog exposed by the installed Ducoro version. Refreshing the upstream model list bypasses the five-minute cache, calls `ducoro-cli connections catalog` and requests another capability match. Search by model or provider to inspect reference IDs and context lengths. This does not download or upgrade Ducoro.

Exact full IDs can match newly added models. Route groups require compatible member identities; mixed versions are not forced into a reference. Manual references take precedence and can pin or disable a mapping. Remove an override to resume automatic matching. Refresh preserves drafts and manual mappings. Failed reads retain the last valid catalog and references rather than revoking them.

## Local service and saving

The page service listens on loopback at `127.0.0.1:3487` by default. Change `servicePort` in Magpie plugin options if needed. During reload, the service waits for the previous host to release the port. Magpie web mode uses its page-service proxy.

Saving uses Magpie's official page message channel, reloads the plugin host and triggers synchronization. API requests check Host, Origin and the page token. The page receives resource names and status, not connection credentials. Capability checks are feature-specific; command availability alone does not verify server permissions or successful execution.

## Diagnostics and recovery

Opening diagnostics or refreshing the report generates a live, in-memory report from the running plugin. Reports show observation time and last synchronization time, including stale and in-progress states. Reading a report does not trigger synchronization; retry synchronization separately, then refresh.

```sh
node diagnostics-cli.mjs
node diagnostics-cli.mjs --lang zh
node diagnostics-cli.mjs --json --lang en
node diagnostics-cli.mjs --port 3488
node diagnostics-cli.mjs --doctor
```

The CLI prints directly to the terminal and does not create report files. `--doctor` only reads daemon information; it does not call models, probe tools or modify configuration. If the plugin is unavailable, the command reports that fact instead of reading an old report.

Legacy `sync-status.json`, `total-status.json`, `model-capabilities.json` and their temporary files are removed on startup. Ownership records, page tokens and skill recovery backups are retained.

The default management file is `~/.config/magpie/ducoro-bridge/state.json`; `XDG_CONFIG_HOME` and `DUCORO_BRIDGE_STATE_DIR` can change its location. Unreadable, corrupt or unsupported records pause synchronization and preserve the original. Check permissions and storage, or preview and restore a compatible valid backup. Recovery restores management records, not Bot configuration; manually preview and synchronize afterward. Never delete or replace the file with an empty object: it contains previous permissions needed for safe revocation.

## Validation limits

Automated coverage includes account policy writes, external conflicts, reapplication and restoration, plus local HTTP proxy access constraints. Real CLI reads confirmed a running daemon and account catalog, but no connected account connector was available. Real account permission writes and the Magpie web proxy still require installation-level acceptance testing. Follow the installation environment; automated checks do not establish real account authorization.

## Main options

| Option | Default | Meaning |
| --- | --- | --- |
| `modelScope` | `global` | Global models or `agents` for Bot assignments |
| `botModels` | `{}` | Bot ID to model ID; omitted entries inherit |
| `mcpScope` | `global` | Global or Bot assignment of Magpie connectors |
| `skillsScope` | `global` | Global or Bot skill assignment |
| `resourceAssignments` | `{}` | Bot ID to `mcp` and `skills` name lists |
| `accountConnectors` | `{}` | Bot ID to connector slug to `{allow, deny}` policy |
| `servicePort` | `3487` | Local page service port |
| `connectionSlug` | `magpie-ducoro` | Plugin model connection slug |
| `modelCapabilityRefs` | `{}` | Manual model capability references |

Gateway connections, complete skill packages, instruction blocks and explicit subagents use the existing sync modules. Hooks and RTK are not synchronized.

## License

MIT

## Additional 0.4.2 improvements

Incremental feature scheduling, bounded file caching and read deduplication reduce repeated work. Model updates and account verification use bounded concurrency. Bot configuration plans support ongoing inheritance with explicit overrides. Diagnostics adds live step timing, model drift actions and selective configuration checkpoint restoration into drafts.

Checkpoints capture desired plugin settings, not skill bodies or running sessions. Model restoration rechecks the reviewed configuration before writing. Unsupported content readback remains unverified. Synthetic benchmarks use simulated CLI latency and are not live-service performance claims.

The new plan, progress, drift and checkpoint controls are localized in English and Chinese, including live statuses, dates, errors and accessibility labels. Switching the host language retains drafts and original resource names. Verification responses localize messages while preserving structured status codes.
