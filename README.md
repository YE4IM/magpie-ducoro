# Ducoro 0.3.5

[简体中文](README.zh-CN.md)

A Magpie plugin that synchronizes model connections, connectors, skills, instructions and selected subagents with Ducoro.

The interface automatically follows Magpie’s UI language: Simplified and Traditional Chinese use the Chinese interface; all other or unknown languages use English. There is no manual language selector or language option. Language changes update page text and accessibility labels without resetting unsaved settings or assignments. User-defined Bot, model and resource names remain unchanged. API errors and diagnostic advice follow the page language; command-line diagnostics default to English.

Install this folder or `magpie-ducoro-0.3.5.tgz` in Magpie and open **Ducoro** in the sidebar to manage sync settings, Bot resources and diagnostics. Requires `ducoro-cli`, a running Ducoro daemon and Magpie page-service support.

Version 0.3.5 removes the Settings panel and Agent diagnostics menu entry; their features remain available on the sidebar page. Magpie generates Installed-row descriptions from declared features, so keeping Agent integration and the sidebar page leaves two normal-state description lines. The plugin summary is now one sentence for discovery cards; it does not replace those generated lines.

The resource page uses three aligned columns: models, connectors and skills. It automatically lists all Bots with read-only names and IDs. Models are single-select; library resources and account connector tools use checkboxes. Refresh preserves unsaved assignments. Unsupported Bots remain visible with explanations.

Models can follow the global Magpie default or be pinned per Bot. Only Pi Agent Bots bound to the plugin connection are updated. Missing selected models retain the current preference and report pending synchronization.

Connectors share one UI column but retain separate sources. Magpie library connectors support global or Bot-local scope. Ducoro account connectors require an existing account connection and exact per-Bot tool policies. They are never automatically equipped on every Bot. Removing a plugin account assignment restores its previous policy; external edits are treated as conflicts.

Library skills and connectors are intersected with enabled resources assigned to Ducoro. Empty assignments revoke only plugin-managed resources, without masking unrelated global or user-owned resources. Explicit resource assignments can target Pi Agent Bots on another model connection.

A loopback-only native HTTP service serves the page and a projected inventory. Default port: `3487`; Host reloads automatically retry binding after the old listener exits. Configure `servicePort` in Magpie options if another application keeps the port occupied. Magpie web uses its page-service proxy. Options remain in Magpie through its official page message protocol; saving reloads the host. APIs validate Host, Origin and a page token; credentials and raw account records are not exposed.

Diagnostics are generated in memory on each visit or refresh from the latest completed sync. The page displays generation and last-sync times separately, including in-progress and stale states. Viewing never triggers synchronization; use **Retry sync** when needed. No diagnostic report files or history are saved. Startup removes the three legacy reports (`sync-status.json`, `total-status.json`, `model-capabilities.json`) and their temporary files; ownership state, page tokens and restoration backups remain.

`node diagnostics-cli.mjs [--json] [--port 3487]` reads the running service and prints to stdout without saving files. When the service is unavailable it reports that explicitly, without falling back to stale files. Manually redirected exports remain user-managed.

New options: `modelScope`, `botModels`, `accountConnectors`, `servicePort`. Existing resource options and capability reference mappings remain available; see the Chinese guide for their contract. No configuration migration was added.


MIT

### Upstream model capabilities (0.3.5)

Capabilities follow the catalog supplied by the installed Ducoro version. **Sync upstream model list** bypasses the bridge’s five-minute cache, reads `ducoro-cli connections catalog`, and queues capability reconciliation. Update Ducoro first to obtain its latest catalog; this action does not download or upgrade Ducoro. Expand the catalog to search model/provider IDs and context limits. Exact upstream IDs also support new model families without a plugin update.

Manual references are optional overrides and take priority over automatic matching. Remove an override to return to automatic matching. A failed refresh retains the last valid catalog and existing references; refresh preserves unsaved settings. Binary connection/scope options now use switches with explicit state labels.

Account connector settings open in a side drawer from **账户配置** beside each Bot’s connector heading. Closing the drawer retains the page draft; use the page’s **保存设置** button to apply changes. Escape and the close button return to the Bot card.
