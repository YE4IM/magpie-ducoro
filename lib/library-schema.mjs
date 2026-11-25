const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const validAgents = agents => agents == null || Array.isArray(agents) && agents.every(agent => typeof agent === 'string');
const validSwitches = item => ['disabled', 'enabled', 'offHere'].every(key => item[key] === undefined || typeof item[key] === 'boolean');

export function validateLibrary(library) {
  if (!record(library)) throw Error('Invalid Magpie library object');
  // Magpie emits null for empty lists that have never been populated.
  for (const kind of ['mcp', 'skills', 'subagents']) {
    const items = library[kind];
    if (items == null) continue;
    if (!Array.isArray(items) || items.some(item => !record(item) ||
        typeof item.name !== 'string' || !item.name.trim() || !validAgents(item.agents) || !validSwitches(item))) {
      throw Error('Invalid Magpie library ' + kind);
    }
  }
  const instructions = library.instructions;
  if (instructions != null && (!record(instructions) || !validAgents(instructions.agents) || !validSwitches(instructions))) {
    throw Error('Invalid Magpie instructions');
  }
  return library;
}
