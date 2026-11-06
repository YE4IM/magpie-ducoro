// Scope planning contains no I/O. An invalid selection must never become an
// empty selection (which would revoke resources) or an unrestricted one.
const BOT_ID = /^agt-[A-Za-z0-9-]+$/
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const names = value => Array.isArray(value) && value.every(name => typeof name === 'string' && name.trim() === name && name.length > 0)

export function validateResourceOptions(opts) {
  if (!['global', 'agents'].includes(opts.mcpScope ?? 'global')) throw Error('mcpScope must be global or agents')
  const skillScope = opts.skillsScope ?? 'global'
  if (!['global', 'agents'].includes(skillScope) && !BOT_ID.test(skillScope)) throw Error('skillsScope must be global, agents, or a Bot id')
  if (!Array.isArray(opts.targetAgents ?? []) || !(opts.targetAgents ?? []).every(id => typeof id === 'string' && BOT_ID.test(id))) throw Error('targetAgents must contain Bot ids')
  const assignments = opts.resourceAssignments ?? {}
  if (!plain(assignments)) throw Error('resourceAssignments must be an object')
  for (const [id, assignment] of Object.entries(assignments)) {
    if (!BOT_ID.test(id) || !plain(assignment)) throw Error('invalid Bot resource assignment')
    for (const [kind, selection] of Object.entries(assignment)) {
      if (!['mcp', 'skills'].includes(kind) || !names(selection)) throw Error('resource selections must be arrays of library names')
    }
  }
}

export function needsResourceTargets(opts) {
  return (opts.syncMcp && opts.mcpScope === 'agents') || (opts.syncSkills && opts.skillsScope === 'agents')
}

export function planResourceScopes(opts, bots = []) {
  validateResourceOptions(opts)
  if (!Array.isArray(bots)) throw Error('unrecognized Ducoro Bot list response')
  const explicit = [...new Set(opts.targetAgents ?? [])]
  const eligible = bots.filter(bot => BOT_ID.test(bot?.id ?? '') && bot.modelPreference?.runtime === 'pi-agent')
  let targets = []
  if (needsResourceTargets(opts)) {
    if (explicit.length) {
      if (explicit.some(id => !eligible.some(bot => bot.id === id))) throw Error('target Bot is missing or does not use pi-agent')
      targets = explicit
    } else {
      const assigned = new Set(Object.keys(opts.resourceAssignments ?? {}))
      targets = eligible.filter(bot => bot.modelPreference?.connectionSlug === opts.connectionSlug || assigned.has(bot.id)).map(bot => bot.id)
      if ([...assigned].some(id => bots.some(bot => bot.id === id) && !eligible.some(bot => bot.id === id))) throw Error('assigned Bot is missing or unsupported')
    }
  }
  const mcpScopes = opts.syncMcp ? (opts.mcpScope === 'agents' ? targets : ['global']) : []
  const skillScopes = opts.syncSkills ? (opts.skillsScope === 'agents' ? targets : [opts.skillsScope || 'global']) : []
  return { targets, mcpScopes, skillScopes }
}

export function scopedLibrary(library, opts, kind, scope) {
  const mode = kind === 'mcp' ? opts.mcpScope : opts.skillsScope
  const selection = mode === 'agents' ? opts.resourceAssignments?.[scope]?.[kind] : undefined
  if (selection === undefined) return library
  const allowed = new Set(selection)
  return { ...library, [kind]: (library[kind] ?? []).filter(item => allowed.has(item?.name)) }
}

// A named selection can be well-formed but unavailable (a typo, disabled
// source, or one not assigned to Ducoro). Signal the affected stage/Bot using
// fixed fields only; never echo arbitrary library names into diagnostics.
export function findUnavailableAssignments(library, opts, plan) {
  validateResourceOptions(opts)
  const issues = []
  for (const kind of ['mcp', 'skills']) {
    const mode = kind === 'mcp' ? opts.mcpScope : opts.skillsScope
    if (mode !== 'agents') continue
    const items = library[kind] ?? []
    if (!Array.isArray(items)) throw Error('invalid resource library')
    const available = new Set(items.filter(item => item && item.offHere !== true &&
      item.disabled !== true && item.enabled !== false &&
      Array.isArray(item.agents) && item.agents.includes('ducoro')).map(item => item.name))
    const scopes = kind === 'mcp' ? plan.mcpScopes : plan.skillScopes
    for (const scope of scopes) {
      const selection = opts.resourceAssignments?.[scope]?.[kind]
      if (selection?.some(name => !available.has(name))) issues.push({ scope, kind })
    }
  }
  return issues
}

export function mcpCommand(scope, action, ...args) {
  return scope === 'global' ? ['mcp', action, ...args] : ['agent', 'mcp', action, scope, ...args]
}
