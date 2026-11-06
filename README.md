# Ducoro 0.3.4

[简体中文](README.zh-CN.md)

A Magpie plugin that synchronizes model connections, connectors, skills, instructions and selected subagents with Ducoro.

Install this folder or the local package in Magpie and open **Ducoro** in the sidebar. Requires `ducoro-cli`, a running Ducoro daemon and Magpie page-service support.

The resource page uses three aligned columns: models, connectors and skills. It automatically lists all Bots with read-only names and IDs. Models are single-select; library resources and account connector tools use checkboxes. Refresh preserves unsaved assignments. Unsupported Bots remain visible with explanations.

Models can follow the global Magpie default or be pinned per Bot. Only Pi Agent Bots bound to the plugin connection are updated. Missing selected models retain the current preference and report pending synchronization.

Connectors share one UI column but retain separate sources. Magpie library connectors support global or Bot-local scope. Ducoro account connectors require an existing account connection and exact per-Bot tool policies. They are never automatically equipped on every Bot. Removing a plugin account assignment restores its previous policy; external edits are treated as conflicts.

Library skills and connectors are intersected with enabled resources assigned to Ducoro. Empty assignments revoke only plugin-managed resources, without masking unrelated global or user-owned resources. Explicit resource assignments can target Pi Agent Bots on another model connection.

A loopback-only native HTTP service serves the page and a projected inventory. Default port: `3487`; Host reloads automatically retry binding after the old listener exits. Configure `servicePort` in Magpie options if another application keeps the port occupied. Magpie web uses its page-service proxy. Options remain in Magpie through its official page message protocol; saving reloads the host. APIs validate Host, Origin and a page token; credentials and raw account records are not exposed.

Diagnostics are generated in memory on each visit or refresh from the latest completed sync. The page displays generation and last-sync times separately, including in-progress and stale states. Viewing never triggers synchronization; use **Retry sync** when needed. No diagnostic report files or history are saved. Startup removes the three legacy reports (`sync-status.json`, `total-status.json`, `model-capabilities.json`) and their temporary files; ownership state, page tokens and restoration backups remain.

`node diagnostics-cli.mjs [--json] [--port 3487]` reads the running service and prints to stdout without saving files. When the service is unavailable it reports that explicitly, without falling back to stale files. Manually redirected exports remain user-managed.

New options: `modelScope`, `botModels`, `accountConnectors`, `servicePort`. Existing resource options and capability reference mappings remain available; see the Chinese guide for their contract. No configuration migration was added.


MIT
