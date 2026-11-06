import test from 'node:test'
import assert from 'node:assert/strict'
import '../ui/model.js'
const { DEFAULT_OPTIONS, EDITABLE_KEYS, optionsForDisplay, validateFields, mergeEditedOptions, parseDiagnosticReport, splitList } = globalThis.DucoroUI

test('UI defaults retain 0.3.1 global scope and tolerate unrelated plugin settings', () => {
  const opts = optionsForDisplay({ intervalMs: 5000, cli: '/custom/ducoro-cli' })
  assert.equal(opts.mcpScope, 'global')
  assert.equal(opts.skillsScope, 'global')
  assert.equal(opts.intervalMs, 5000)
  assert.equal(opts.cli, '/custom/ducoro-cli')
  opts.officialProviders.push('test')
  assert.ok(!DEFAULT_OPTIONS.officialProviders.includes('test'))
})

test('saving a draft preserves unknown options and concurrent edits to untouched fields', () => {
  const baseline = optionsForDisplay({})
  const edited = structuredClone(baseline)
  edited.syncMcp = false
  const current = { intervalMs: 9000, syncSkills: false, futureOption: { enabled: true } }
  const result = mergeEditedOptions(current, baseline, edited)
  assert.deepEqual(result.changed, ['syncMcp'])
  assert.deepEqual(result.options, { ...current, syncMcp: false })
})

test('saving detects a conflicting concurrent edit to the same field', () => {
  const baseline = optionsForDisplay({})
  const edited = structuredClone(baseline)
  edited.targetAgents = ['agt-one']
  assert.throws(() => mergeEditedOptions({ targetAgents: ['agt-two'] }, baseline, edited), /其他页面更新/)
})

test('the compact panel only changes toggle fields and does not touch Bot assignments', () => {
  const baseline = optionsForDisplay({ resourceAssignments: { 'agt-one': { mcp: [] } } })
  const edited = structuredClone(baseline)
  edited.syncMcp = false
  edited.resourceAssignments = {}
  const { options } = mergeEditedOptions({ resourceAssignments: baseline.resourceAssignments }, baseline, edited, ['syncMcp'])
  assert.deepEqual(options.resourceAssignments, baseline.resourceAssignments)
  assert.equal(options.syncMcp, false)
})

test('resource editor represents inheritance and an explicit empty set independently', () => {
  const options = optionsForDisplay({ mcpScope: 'agents', skillsScope: 'agents', resourceAssignments: {
    'agt-inherit': {}, 'agt-empty': { mcp: [], skills: [] }, 'agt-specific': { skills: ['review'] },
  } })
  validateFields(options)
  assert.equal(Object.hasOwn(options.resourceAssignments['agt-inherit'], 'mcp'), false)
  assert.deepEqual(options.resourceAssignments['agt-empty'].mcp, [])
  assert.deepEqual(splitList('github, filesystem\ngithub\n'), ['github', 'filesystem'])
})

test('invalid Bot IDs, delimiter injections, model references, and resource shapes are rejected', () => {
  for (const patch of [
    { targetAgents: ['../foreign'] }, { skillsScope: 'other' }, { mcpScope: 'other' },
    { modelCapabilityRefs: { 'group/test': 'zai/model,other=value' } },
    { resourceAssignments: { 'agt-one': { mcp: 'all' } } },
    { resourceAssignments: { 'agt-one': { tools: ['shell'] } } },
    { syncConnection: 'true' },
  ]) assert.throws(() => optionsForDisplay(patch))
  assert.deepEqual(optionsForDisplay({ modelCapabilityRefs: { 'group/mixed': null } }).modelCapabilityRefs, { 'group/mixed': null })
})

test('diagnostic imports only keep known safe fields and preserve uncertainty', () => {
  const raw = { schemaVersion: 1, pluginVersion: '0.3.2', updatedAt: '2026-11-06T07:00:00Z', status: 'configured',
    features: { connection: { status: 'configured', count: 1 }, mcp: { status: 'loaded', count: -2 } },
    gatewayKey: 'must-never-render', issues: [{ feature: 'mcp', code: 'pending', message: '<script>malicious()</script>', nextAction: 'retry', targets: ['agt-one'] }],
  }
  const parsed = parseDiagnosticReport(raw)
  assert.equal(parsed.features.mcp.status, 'unknown')
  assert.equal(parsed.features.mcp.count, null)
  assert.equal(parsed.features.skills.status, 'unknown')
  assert.equal(Object.hasOwn(parsed, 'gatewayKey'), false)
  assert.equal(parsed.issues[0].message, '<script>malicious()</script>') // The view renders textContent.
  assert.throws(() => parseDiagnosticReport({ schemaVersion: 2, features: {} }), /受支持/)
  assert.throws(() => parseDiagnosticReport({ schemaVersion: 1, features: { arbitrary: {} } }), /受支持/)
})

test('display-model comparisons are insensitive to dictionary key order', () => {
  const baseline = optionsForDisplay({ modelCapabilityRefs: { 'group/one': null, 'group/two': 'zai/two' } })
  const edited = { ...baseline, modelCapabilityRefs: { 'group/two': 'zai/two', 'group/one': null } }
  assert.deepEqual(mergeEditedOptions({}, baseline, edited, ['modelCapabilityRefs']).changed, [])
  assert.ok(EDITABLE_KEYS.includes('resourceAssignments'))
})

test('diagnostic imports retain only verified probe states and neutral unselected resources', () => {
  for (const [probeStatus, expected] of [['passed', 'passed'], ['failed', 'failed'], ['unknown', 'unknown'], ['loaded', 'unknown'], [undefined, 'unknown']]) {
    const parsed = parseDiagnosticReport({ schemaVersion: 1, roundId: 'ignored', runtimeLoaded: 'loaded', features: {
      mcp: { status: 'configured', probeStatus },
      instructions: { status: 'skipped', skipReason: 'not-selected', count: 0 },
      subagents: { status: 'skipped', skipReason: 'other' },
    } })
    assert.equal(parsed.features.mcp.probeStatus, expected)
    assert.equal(parsed.features.instructions.skipReason, 'not-selected')
    assert.equal(parsed.features.subagents.skipReason, null)
    assert.equal(Object.hasOwn(parsed, 'runtimeLoaded'), false)
    assert.equal(Object.hasOwn(parsed, 'roundId'), false)
  }
})
