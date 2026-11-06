// Validate public settings before the bridge performs any durable mutation.
// Errors deliberately contain field paths and fixed codes, never option values.
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const botId = value => typeof value === 'string' && /^agt-[a-zA-Z0-9-]+$/.test(value)
const nonempty = value => typeof value === 'string' && value.trim().length > 0 && !/[\r\n\0]/.test(value)
const names = value => Array.isArray(value) && value.every(item => nonempty(item) && item.trim() === item) && new Set(value).size === value.length

export function validateOptions(options) {
  const errors = []
  const fail = (field, code) => errors.push({ field, code })
  if (!record(options)) return [{ field: 'options', code: 'object-required' }]
  for (const field of ['syncConnection', 'syncAgentModels', 'syncMcp', 'syncSkills', 'syncInstructions', 'syncSubagents', 'syncLibraryMcp', 'syncPluginTools', 'prune']) {
    if (options[field] !== undefined && typeof options[field] !== 'boolean') fail(field, 'boolean-required')
  }
  if (options.dryRun !== undefined && typeof options.dryRun !== 'boolean' && options.dryRun !== 'true' && options.dryRun !== 'false') fail('dryRun', 'boolean-required')
  for (const field of ['cli', 'connectionSlug', 'connectionName', 'mcpPrefix', 'mcpToolsSlug', 'mcpToolsName']) {
    if (options[field] !== undefined && !nonempty(options[field])) fail(field, 'nonempty-string-required')
  }
  if (options.mcpScope !== undefined && !['global', 'agents'].includes(options.mcpScope)) fail('mcpScope', 'scope-invalid')
  if (options.skillsScope !== undefined && !['global', 'agents'].includes(options.skillsScope) && !botId(options.skillsScope)) fail('skillsScope', 'scope-invalid')
  if (options.onDisconnect !== undefined && !['keep', 'remove'].includes(options.onDisconnect)) fail('onDisconnect', 'enum-invalid')
  if (options.intervalMs !== undefined && (!Number.isSafeInteger(options.intervalMs) || options.intervalMs < 1000)) fail('intervalMs', 'interval-invalid')
  if (options.targetAgents !== undefined && (!Array.isArray(options.targetAgents) || !options.targetAgents.every(botId) || new Set(options.targetAgents).size !== options.targetAgents.length)) fail('targetAgents', 'bot-list-invalid')
  for (const field of ['subagentNames', 'officialProviders']) {
    if (options[field] !== undefined && !names(options[field])) fail(field, 'name-list-invalid')
  }
  if (options.modelCapabilityRefs !== undefined) {
    if (!record(options.modelCapabilityRefs)) fail('modelCapabilityRefs', 'object-required')
    else if (Object.entries(options.modelCapabilityRefs).some(([key, value]) => !nonempty(key) || (value !== null && (!nonempty(value) || !/^[^,=\s]+\/[^,=\s]+$/.test(value))))) fail('modelCapabilityRefs', 'reference-invalid')
  }
  if (options.resourceAssignments !== undefined) {
    if (!record(options.resourceAssignments)) fail('resourceAssignments', 'object-required')
    else for (const [id, assignment] of Object.entries(options.resourceAssignments)) {
      // Do not echo an untrusted identifier in a diagnostic field path.
      if (!botId(id)) { fail('resourceAssignments', 'bot-id-invalid'); continue }
      if (!record(assignment)) { fail(`resourceAssignments.${id}`, 'object-required'); continue }
      for (const key of Object.keys(assignment)) {
        if (!['mcp', 'skills'].includes(key)) fail(`resourceAssignments.${id}`, 'unknown-resource-type')
        else if (!names(assignment[key])) fail(`resourceAssignments.${id}.${key}`, 'name-list-invalid')
      }
    }
  }
  return errors
}

export function assertValidOptions(options) {
  const errors = validateOptions(options)
  if (errors.length) {
    const error = new Error('Invalid Ducoro bridge settings; correct the reported fields before synchronization.')
    error.code = 'BRIDGE_OPTIONS_INVALID'
    error.fields = errors
    throw error
  }
  return options
}
