# Changelog

[**English**](./CHANGELOG.md) | [中文](./CHANGELOG-zh-CN.md)

## [v0.4.11](https://github.com/YE4IM/magpie-ducoro/compare/v0.4.10...v0.4.11) - 2026-11-25

Find which Bots use a resource, compare two Bots, and verify a shared plan on one Bot before rolling it out.

### Added

- Find which Bots receive a skill or library connector, where the assignment comes from, and its latest read-back result.
- Compare two Bots across model routes, resource assignments, account tool permissions, and verification, with links to the corresponding settings.
- Try a shared plan with one Bot. The trial persists across automated syncs and host restarts. Verify it before rolling it out or restoring the previous plan.

### Changed

- Show why a resource will be removed when assignments, switches, library entries, or export files change. Flag first-time gateway connection creation in the preview.
- Poll the task center less frequently while idle and refresh immediately when returning to the page or retrying sync.

### Fixed

- Accept null resource lists in Magpie exports and preserve managed connector records when the MCP export is unreadable.
- Keep instruction previews, writes, and read-back verification consistent when Ducoro normalizes blank lines around a managed instruction block.
- Check the configured gateway route during read-back and verify skill contents and file modes from a single scan.

### Maintenance & Dependencies

- Use the package version in the plugin page and diagnostics, and check versioned installation examples before packaging.

[Release notes](./RELEASE-NOTES.md)

## [v0.4.10](https://github.com/YE4IM/magpie-ducoro/compare/v0.4.9...v0.4.10) - 2026-11-17

The install guide now walks through plugin registration, preview, and verification of the first sync.

### Maintenance & Dependencies

- Document the Magpie page-service and Ducoro CLI requirements, preview and save, and read-only diagnostics.
- Update the version shown on the plugin page and in diagnostic reports.

[Release notes](./releases/v0.4.10.md)

## [v0.4.9](https://github.com/YE4IM/magpie-ducoro/compare/v0.4.8...v0.4.9) - 2026-11-16

The npm package corrects the entry point for the diagnostics command.

### Fixed

- Correct the packaged `bin` path so npm installations expose `magpie-ducoro-status`.

[Release notes](./releases/v0.4.9.md)

## [v0.4.8](https://github.com/YE4IM/magpie-ducoro/compare/v0.4.7...v0.4.8) - 2026-11-16

First-time setup creates a missing gateway connection, and sync previews use the same resource selection rules as apply.

### Changed

- Apply the same resource selection rules in preview, sync, and verification.
- Bound shared skill scans by time, depth, and size, and allow cancellation during reads.

### Fixed

- Treat an explicit CLI JSON `null` as a missing connection and omit empty capability references when creating it. Updates can still clear old references.
- Preview revocation when an exported connector is disabled, and show content changes only for resources that remain assigned.

### Maintenance & Dependencies

- Publish this version to npm as `magpie-ducoro`.

[Release notes](./releases/v0.4.8.md)

## [v0.4.4](https://github.com/YE4IM/magpie-ducoro/compare/v0.4.3...v0.4.4) - 2026-11-16

Connector previews report actual changes, and previews use the same instruction and subagent targets as sync.

### Changed

- Reuse inventory for the immediate automatic comparison. Manual and pre-save previews reread it. Run healthy full scans every five minutes while retaining faster polling in degraded mode.
- Validate recovery-operation timestamps, revision hashes, attempt counts, and dependencies before importing backups.

### Fixed

- Preserve plan target selections across list refreshes and language changes.
- Skip operation-log writes for verified, unchanged resources while retaining retries for missing or failed resources.

[Release notes](./releases/v0.4.4.md)

## [v0.4.7](https://github.com/YE4IM/magpie-ducoro/compare/v0.4.6...v0.4.7) - 2026-11-13

Grouped settings and expandable editors make it easier to review each Bot’s assigned resources.

### Changed

- Group sync settings and align model, connector, and skill editors. Show the target range when reviewing a plan.
- Improve keyboard access, status messages, dates, and accessible labels in both languages.

### Fixed

- Center save-bar status text and remove spacing for empty draft notices.

[Release notes](./releases/v0.4.7.md)

## [v0.4.6](https://github.com/YE4IM/magpie-ducoro/compare/v0.4.5...v0.4.6) - 2026-11-13

Review plan edits before saving and review the impact of a management-record restore before resuming sync.

### Changed

- Reorganize Bot resources and improve search, focus, and backup summaries.
- Require a fresh preview before explicitly resuming synchronization after restoring management records.

### Fixed

- Include plan edits when saving and checking unsaved changes. Correct preview failures, global change counts, and initial verification status.

[Release notes](./releases/v0.4.6.md)

## [v0.4.5](https://github.com/YE4IM/magpie-ducoro/compare/v0.4.4...v0.4.5) - 2026-11-11

Compare current and desired settings, recover drafts after reloading, and verify interrupted writes before recording ownership.

### Added

- Use the task center to retry, pause, or resume individual operations. Temporary failures retry with backoff.
- Name, annotate, retain, and export backups. Selective rollback includes related plans, inheritance, and scope changes.
- Undo the latest bulk assignment. Copies use the source Bot's effective configuration, including inherited settings.

### Changed

- Show whether each previewed value comes from global settings, an inherited plan, or a Bot override, and list managed blocks and files scheduled for removal.
- Autosave settings and plan drafts and detect concurrent page edits before overwriting.
- Track saved, written, read-back, and session-loaded stages. Continue verification in the background after 35 seconds and reconnect when the page reopens.
- Record intent before creating connectors or skills. After an interrupted write, read back identity and content before confirming ownership.
- Pause automatic synchronization after restoring management records until the user reviews the impact and resumes it.
- Reduce repeated skill preparation and journal writes. On timeout or cancellation, close the command process tree and reconcile uncertain writes.

### Fixed

- Preserve existing skills when selected sources share a manifest name, and preserve instructions when exported instructions are missing or incomplete.
- Report stale or missing subagent files against the current desired content. Prevent an invalid resource library from revoking existing assignments.
- Use cross-platform path checks for skill reading, staging, and watching. Enable backup downloads from the plugin page.
- Report a conflict when the CLI cannot safely clear connector arguments or change transport. Store comma-containing connector credentials through references.

[Release notes](./releases/v0.4.5.md)

## [v0.4.3](https://github.com/YE4IM/magpie-ducoro/compare/v0.4.2...v0.4.3) - 2026-11-08

Review backups, restore management records, and roll back selected configuration from one page.

### Added

- Import external backups, preview restores, selectively roll back configuration, and preview local-record cleanup.

### Changed

- Save management changes in an incremental journal and reconcile interrupted operations against actual state before retrying.
- Improve timeout and cancellation cleanup, output limits, and concurrent inventory reads.
- Preserve ownership, original permission data, unfinished operations, and in-use skills during local cleanup.

### Fixed

- Preserve previous diagnostics and outstanding issues for resources outside the current incremental sync.

[Release notes](./releases/v0.4.3.md)

## [v0.4.2](https://github.com/YE4IM/magpie-ducoro/compare/v0.4.1...v0.4.2) - 2026-11-07

Share a plan across Bots, keep individual overrides, and check incremental sync results item by item.

### Added

- Add sync progress and timings, model drift detection, item-level readback, and selective configuration rollback.
- Add Bot search, pending-change counts, bulk assignment copy, and backup preview and deletion.

### Changed

- Reuse cached skill content, merge concurrent reads, and verify model changes concurrently.
- Localize dynamic statuses, errors, and verification results. Add `--lang en|zh` to the diagnostics CLI.

### Fixed

- Check for model drift before resuming management through a rollback, expanding targets, or re-enabling connection sync.
- Report missing instructions on a first write and mark unreadable target directories as unverified.

[Release notes](./releases/v0.4.2.md)

## [v0.4.1](https://github.com/YE4IM/magpie-ducoro/compare/v0.4.0...v0.4.1) - 2026-11-07

Edit settings as they load and keep the previous diagnostics available while they refresh.

### Changed

- Load settings, resources, and catalogs independently. Limit concurrent permission reads and stop related reads when the preview is cancelled.
- Confirm before discarding drafts, keep previous diagnostics visible during refresh, and make save feedback reflect actual sync status.

### Fixed

- Prevent stale responses from replacing drafts and align the three resource controls on narrow layouts.

[Release notes](./releases/v0.4.1.md)

## [v0.4.0](https://github.com/YE4IM/magpie-ducoro/compare/v0.3.5...v0.4.0) - 2026-11-07

Before saving, preview the model, connector, skill, and account permission changes for each Bot.

### Added

- Preview global-to-per-Bot resource moves, model assignments, and account permissions before confirming a save.
- Resolve account permission conflicts by keeping the Ducoro policy or reapplying Magpie settings. Recheck the reviewed policy before writing.

### Changed

- Check feature capabilities independently, prioritize account revocations, and preserve recovery records for uncertain writes.
- Pause sync when management records cannot be read and back off watch recovery when source files are unchanged.
- Localize previews, errors, account controls, and recovery guidance while preserving drafts on language changes.

### Fixed

- Distinguish empty exports, disconnected sources, and unreadable exports when reporting skill and model sync status.

[Release notes](./releases/v0.4.0.md)

## [v0.3.5](https://github.com/YE4IM/magpie-ducoro/compare/v0.3.4...v0.3.5) - 2026-11-06

Edit account connectors in a side drawer and search the Ducoro model catalog for capability references.

### Changed

- Edit assignment mode, account, and tool permissions together. Closing the drawer preserves the draft.
- Refresh the Ducoro catalog on demand and keep the last usable catalog if the refresh fails. Match full model IDs for newly listed model families.
- Follow Magpie's language automatically and preserve drafts during language changes. Diagnostics default to English.

[Release notes](./releases/v0.3.5.md)

## [v0.3.4](https://github.com/YE4IM/magpie-ducoro/compare/v0.3.2...v0.3.4) - 2026-11-06

Assign resources from one settings page and check sync through live diagnostics.

### Breaking Changes

- **Legacy diagnostics**: Startup removes legacy diagnostic reports, and the settings page drops JSON snapshot imports.

**Migration:**

1. Use the Ducoro page’s diagnostics view for interactive checks.
2. For scripts, switch to the read-only diagnostics CLI, which reads from the running plugin service.

### Added

- Follow the default model or pin a model for a Bot. Assign library connectors, skills, and permitted account tools from the plugin page.
- Request a live diagnostics report or retry synchronization from the page. Reports distinguish the viewing time from the last synchronization time.

### Fixed

- Reconnect the page service after a plugin reload and allow Magpie desktop page origins.

[Release notes](./releases/v0.3.4.md)

## [v0.3.2](https://github.com/YE4IM/magpie-ducoro/compare/v0.3.1...v0.3.2) - 2026-11-06

The new settings console lets you pick target Bots, map model capabilities, and assign resources per Bot.

### Added

- Configure target Bots and model capability mappings. Assign MCP connectors and skills by Bot with inheritance or explicit empty lists.
- Inspect unified diagnostics from a read-only CLI or import a report snapshot into the console.

### Changed

- Validate assignment scopes and resource lists before sync, and migrate older global management records when changing scope.

[Release notes](./releases/v0.3.2.md)

## [v0.3.1](https://github.com/YE4IM/magpie-ducoro/compare/v0.3.0...v0.3.1) - 2026-11-06

Associated Ducoro Bots follow Magpie’s default model and can use official catalog entries as capability references.

### Added

- Follow the Magpie default model for associated Bots, repair stale model IDs, and preserve supported thinking levels.
- Match individual models and route groups against the official catalog. Show candidates and capability differences for uncertain matches, and allow manual overrides or disabling references.
- Watch route-group membership changes and retry or recover synchronization after failure or restart.

[Release notes](./releases/v0.3.1.md)

## [v0.3.0](https://github.com/YE4IM/magpie-ducoro/releases/tag/v0.3.0) - 2026-11-05

The first release connects Ducoro to Magpie models and syncs selected resources through the local CLI.

### Added

- Connect Ducoro to Magpie models and synchronize assigned MCP connectors, skills, instructions, and explicitly selected subagents.

[Release notes](./releases/v0.3.0.md)
