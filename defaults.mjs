import "./ui/defaults.js";
export const DEFAULTS = {
  ...structuredClone(globalThis.DucoroDefaultOptions),
  cli: "ducoro-cli",
  servicePort: 3487,
  connectionName: "Magpie gateway",
  syncLibraryMcp: true,
  // Legacy options are only used to identify an old owned aggregate for removal.
  syncPluginTools: false,
  mcpToolsSlug: "magpie-tools",
  mcpToolsName: "Magpie plugin tools",
  mcpPrefix: "magpie-",
  intervalMs: 120_000,
  dryRun: false,
}
