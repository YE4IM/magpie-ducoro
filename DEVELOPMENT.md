# 0.3.2 development notes

## Architecture

The Magpie Agent declaration continues to export the gateway, library MCP, skills and instructions. `bridge.mjs` reconciles those exports through `ducoro-cli`. `resource-scopes.mjs` plans same-scope MCP and skill operations. `options.mjs` validates settings before durable mutations. `diagnostics.mjs` produces the public, allowlisted report; `diagnostics-cli.mjs` reads it without changing configuration.

The package has no third-party runtime dependencies. The UI uses Magpie’s documented classic `_magpie/bridge.js`, `magpie.ready`, `magpie.options.get/set`, `magpie.onAction` and theme variables. `ui/model.js` is the actual browser data helper exercised by Node tests. Static assets and scripts live below `ui/`, matching Magpie’s page-serving boundary. No backend API or custom native bridge is assumed.

## Resource contracts

- `mcpScope`: `global` or `agents`; `skillsScope`: `global`, `agents` or one existing Bot ID.
- `resourceAssignments`: Bot ID to optional `mcp` and `skills` name arrays. Omission inherits the Magpie selection, while an empty array explicitly assigns none.
- Explicit selections are intersected with enabled resources assigned to the Ducoro Magpie row. They cannot enable unassigned resources.
- In `agents` mode the roster is read through the CLI. Explicit `targetAgents` selects pi-agent Bots; otherwise only pi-agent Bots bound to `connectionSlug` are selected. Failed roster reads preserve current resources for retry.
- Revocations of owned entries precede additions. A failed cleanup blocks new additions for that resource family. Other global Ducoro definitions continue to inherit normally.
- MCP ownership records use `scope:slug` keys and record scope, slug and source digest. Legacy slug/digest entries migrate as global records. Skills keep the existing scope/name ownership and replacement journal.
- Only one plugin version should manage a given state directory. Keep a copy of the pre-upgrade private state when planning a downgrade; 0.3.1 does not understand scoped MCP ownership records.

## Diagnostic evidence

The public report is `<stateDir>/sync-status.json`; private ownership remains in `state.json`. Report export uses fixed messages, known codes, Bot identifiers and counts rather than CLI output, endpoint URLs, resource contents or credentials. Configuration status and running-session loading are separate; runtime loading stays unknown.

A missing, stale or malformed report is never treated as a successful check. A disabled resource with unfinished cleanup remains pending. Reports for optional, unselected instruction/subagent resources are neutral rather than blocking an otherwise healthy configuration summary. A CLI doctor call only reads daemon information; it does not run an LLM, install dependencies, probe MCP servers or restart participants.

The Magpie page cannot fetch local files or call the CLI through its public bridge. Users import a report JSON snapshot. Diagnostic data stays in page memory and is not persisted in plugin options. The UI preserves options it does not edit, rereads options before saving, and rejects same-field changes detected from another editor. The native options API provides no compare-and-swap operation, so simultaneous writers between that final read and save still follow Magpie’s native last-write behavior.

## Verification and packaging

Run `npm test`. Tests use temporary directories, fake CLI executables and mocked page bridges; they never alter the installed Magpie/Ducoro settings or call an LLM. Browser QA uses the same sandbox restrictions as a Magpie page and covers configuration saves, explicit empty resource sets, concurrent editing, imported reports and narrow dark layouts.

Run `npm pack --ignore-scripts` to build the installable package. Verify that all imported server modules, `diagnostics-cli.mjs`, `ducoro.agent.js`, `assets/` and `ui/` are included. A package imported in a clean location should expose one default server plugin object without starting synchronization during module import.
