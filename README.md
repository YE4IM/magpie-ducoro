# Ducoro 0.4.1

[简体中文](README.zh-CN.md)

A Magpie plugin that synchronizes model connections, connectors, skills, instructions and selected subagents with Ducoro.

The interface automatically follows Magpie’s UI language: Simplified and Traditional Chinese use the Chinese interface; all other or unknown languages use English. There is no manual language selector or language option. Language changes update page text and accessibility labels without resetting unsaved settings or assignments. User-defined Bot, model and resource names remain unchanged. API errors and diagnostic advice follow the page language; command-line diagnostics default to English.

Install this folder or `magpie-ducoro-0.4.1.tgz` in Magpie and open **Ducoro** in the sidebar to manage sync settings, Bot resources and diagnostics. Requires `ducoro-cli`, a running Ducoro daemon and Magpie page-service support.

## Refined in 0.4.1

- Preview account reads use at most four concurrent Bots and a 25-second account budget within a 40-second overall request budget. Partial failures retain other results, and disconnected requests stop pending reads.
- Settings become editable before optional inventories and catalogs finish. Ordinary API calls share a 25-second deadline with at most one read retry; writes are never replayed automatically. Preview requests have a 45-second client deadline.
- Shared busy states prevent background refreshes from unlocking a save or overwriting a newer draft. Reload asks before discarding edits.
- Save feedback waits for a completed sync round instead of assuming completion after three seconds. Unconfirmed results remain explicit; report refreshes retain the previous report.
- CLI lifecycle and inventory projections are separate modules, removing the service/preview/account import cycle. Critical modules are formatted for review.
- New messages support Chinese and English, follow Magpie’s language, and preserve unsaved drafts during language changes.

## Features introduced in 0.4.0

- **Changes by Bot:** select **Preview changes** to inspect a draft. **Save settings** opens **Review before saving** before any options are saved. The preview lists global and per-Bot resource additions/removals, affected Bots, models and account tool permissions.
- **Desired and current settings:** expand a Bot card to compare the desired Magpie model with the current Ducoro model and account tool permissions. The desired global model comes from Magpie’s export, even if Ducoro has not caught up yet.
- **Account permission conflicts:** choose **Use current Ducoro permissions** or **Reapply Magpie permissions**. The choice stays in the draft until previewed and saved. It is bound to the observed policy and ownership revision; later external changes invalidate it.
- **Host capabilities:** model catalog, model commands, account policy operations, per-Bot connectors and per-Bot skills are checked separately. An unavailable feature does not prevent other features from syncing. A local command being available does not prove server permissions or successful execution.
- **Safer reconciliation:** account removals run before additions across Bots, and connector failures are isolated. Unreadable, damaged or unknown-version ownership records pause sync without replacing the original. Watch recovery backs off and triggers fallback sync only when sources change.
- **Complete English and Chinese UI:** previews, conflict choices, capability explanations, recovery messages, API warnings and diagnostics follow Magpie’s language. Open dialogs and unsaved drafts survive language changes. Names, model IDs, tool IDs and permission values remain literal.

The preview shares scope, model-target and account-policy planning with sync. It describes plugin-owned assignments, rather than all user-installed resources. Resource content updates, name conflicts, effective model capabilities, execution permissions and loading in running sessions are still verified during sync. A preview is not a promise of successful execution.

The resource page uses three aligned columns: models, connectors and skills. It automatically lists all Bots with read-only names and IDs. Models are single-select; library resources and account connector tools use checkboxes. Refresh preserves unsaved assignments. Unsupported Bots remain visible with explanations.

Models can follow the global Magpie default or be pinned per Bot. Only Pi Agent Bots bound to the plugin connection are updated. Missing selected models retain the current preference and report pending synchronization.

Connectors share one UI column but retain separate sources. Magpie library connectors support global or Bot-local scope. Ducoro account connectors require an existing account connection and exact per-Bot tool policies. They are never automatically equipped on every Bot. Removing a plugin account assignment restores its previous policy; external edits are treated as conflicts.

Library skills and connectors are intersected with enabled resources assigned to Ducoro. Empty assignments revoke only plugin-managed resources, without masking unrelated global or user-owned resources. Explicit resource assignments can target Pi Agent Bots on another model connection.

A loopback-only native HTTP service serves the page and a projected inventory. Default port: `3487`; Host reloads automatically retry binding after the old listener exits. Configure `servicePort` in Magpie options if another application keeps the port occupied. Magpie web uses its page-service proxy. Options remain in Magpie through its official page message protocol; saving reloads the host. APIs validate Host, Origin and a page token; credentials and raw account records are not exposed.

Diagnostics are generated in memory on each visit or refresh from the latest completed sync. The page displays generation and last-sync times separately, including in-progress and stale states. Viewing never triggers synchronization; use **Retry sync** when needed. No diagnostic report files or history are saved. Startup removes the three legacy reports (`sync-status.json`, `total-status.json`, `model-capabilities.json`) and their temporary files; ownership state, page tokens and restoration backups remain.

`node diagnostics-cli.mjs [--json] [--port 3487]` reads the running service and prints to stdout without saving files. When the service is unavailable it reports that explicitly, without falling back to stale files. Manually redirected exports remain user-managed.

Options include `modelScope`, `botModels`, `accountConnectors`, `accountResolutions` and `servicePort`. Existing resource options and capability reference mappings remain available; see the Chinese guide for their contract. No configuration migration was added.


## Ownership record recovery

**Sync diagnostics → Restore the ownership record** explains how to recover from an unreadable, damaged or unknown-version `state.json`. Check file permissions or restore your own valid backup, then select **Read the ownership record again**. The button requests another read; it does not clear or replace the record.

The default path is `~/.config/magpie/ducoro-bridge/state.json`, unless `XDG_CONFIG_HOME` or `DUCORO_BRIDGE_STATE_DIR` changes it. Do not delete or reset this file: it contains previous permissions and plugin ownership needed for safe removals. Versions 1 and 2 remain readable; no clearing or migration is required.

## Compatibility

Version 0.4.1 has been checked in Magpie desktop for layout alignment, draft protection, review before save, sync feedback and English/Chinese switching. A dedicated Bot verified real model preference writes, per-Bot switching, unavailable-model protection and return to the global model. Disconnected-account rejection was also verified. Successful connected-account permission writes, conflict reapplication and restoration still lack live coverage. Some model capability references require manual confirmation. The Magpie Web proxy path was not retested for 0.4.1.

### Upstream model capabilities (0.4.1)

Capabilities follow the catalog supplied by the installed Ducoro version. **Sync upstream model list** bypasses the bridge’s five-minute cache, reads `ducoro-cli connections catalog`, and queues capability reconciliation. Update Ducoro first to obtain its latest catalog; this action does not download or upgrade Ducoro. Expand the catalog to search model/provider IDs and context limits. Exact upstream IDs also support new model families without a plugin update.

Manual references are optional overrides and take priority over automatic matching. Remove an override to return to automatic matching. A failed refresh retains the last valid catalog and existing references; refresh preserves unsaved settings. Binary connection/scope options now use switches with explicit state labels.

Account connector settings open in a side drawer from **Account settings** beside each Bot’s connector heading. Closing the drawer retains the page draft; use **Save settings**, review the changes, then select **Save and sync** to apply them. Escape and the close button return to the Bot card.

## License

MIT
