// Shared editable defaults for browser, bridge and checkpoints.
globalThis.DucoroDefaultOptions = Object.freeze( {
  botPlansCatalog: {}, botPlans: {}, botInstructions: {}, pausedModels: [], modelGuards: {},
  connectionSlug: 'magpie-ducoro', syncConnection: true, syncAgentModels: true,
  syncMcp: true, syncSkills: true, syncInstructions: true, syncSubagents: true,
  prune: true, onDisconnect: 'keep', targetAgents: [], subagentNames: [],
  modelScope: 'global', botModels: {}, accountConnectors: {}, accountResolutions: {},
  mcpScope: 'global', skillsScope: 'global', resourceAssignments: {},
  modelCapabilityRefs: {}, officialProviders: [
    'zai', 'zai-coding-cn', 'kimi-coding', 'moonshotai', 'moonshotai-cn',
    'anthropic', 'openai', 'google', 'deepseek', 'xai', 'minimax', 'minimax-cn', 'alibaba', 'alibaba-cn',
  ],
});
