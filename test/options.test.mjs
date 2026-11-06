import test from 'node:test'
import assert from 'node:assert/strict'
import { validateOptions, assertValidOptions } from '../options.mjs'

test('accepts existing single-Bot skill scope and explicit empty per-Bot selections', () => {
  assert.deepEqual(validateOptions({ skillsScope: 'agt-writer', mcpScope: 'agents', resourceAssignments: { 'agt-coder': { mcp: [], skills: ['repo-review'] }, 'agt-writer': {} } }), [])
  assert.deepEqual(validateOptions({ mcpScope: 'global', skillsScope: 'global', targetAgents: [], modelCapabilityRefs: { 'group/mixed': null, 'group/glm': 'zai/glm-5.3-flash' } }), [])
})

test('rejects malformed or widening selections instead of interpreting them as inherited', () => {
  for (const resourceAssignments of [null, [], { 'agt-coder': { mcp: null } }, { 'agt-coder': { skills: '*' } }, { 'agt-coder': { mcp: ['tool', 'tool'] } }, { 'agt-coder': { unknown: [] } }, { '../other': { mcp: [] } }]) {
    assert.ok(validateOptions({ resourceAssignments }).length)
    assert.throws(() => assertValidOptions({ resourceAssignments }), { code: 'BRIDGE_OPTIONS_INVALID' })
  }
  for (const options of [{ targetAgents: null }, { targetAgents: ['all'] }, { mcpScope: 'all' }, { skillsScope: '../other' }, { syncMcp: 'false' }, { modelCapabilityRefs: { route: 'zai/model,other=ref' } }]) assert.ok(validateOptions(options).length)
})

test('validation errors exclude arbitrary supplied values', () => {
  const secret = 'https://private.example/?api_key=secret'
  const result = validateOptions({ resourceAssignments: { [secret]: { [secret]: secret } }, modelCapabilityRefs: { model: secret } })
  assert.ok(result.length)
  assert.ok(!JSON.stringify(result).includes(secret))
  assert.ok(!JSON.stringify(result).includes('private.example'))
})
