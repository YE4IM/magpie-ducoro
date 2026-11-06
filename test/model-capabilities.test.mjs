import test from 'node:test'
import assert from 'node:assert/strict'
import { modelIdentity, resolveCapabilityMappings as resolve } from '../model-capabilities.mjs'

const GLM = 'glm-5.3-flash'
const GROUP = 'group/fast'
const ZAI = `zai/${GLM}`
const OPEN = `opencode/${GLM}`
const KIMI = 'kimi-coding/k3'
const depths = ['low', 'high', 'max']
const catalog = [
  { provider: 'opencode', id: GLM, name: 'GLM-5.3-Flash', contextWindow: 1000000, thinkingCapability: { depths } },
  { provider: 'zai', id: GLM, name: 'GLM-5.3-Flash', contextWindow: 1000000, thinkingCapability: { depths } },
  { provider: 'zai-coding-cn', id: GLM, name: 'GLM-5.3-Flash', contextWindow: 1000000, thinkingCapability: { depths } },
  { provider: 'kimi-coding', id: 'k3', name: 'Kimi K3', contextWindow: 1048576, thinkingCapability: { depths } },
  { provider: 'moonshotai', id: 'kimi-k3', name: 'Kimi K3', contextWindow: 1048576, thinkingCapability: { depths } },
  { provider: 'kimi-coding', id: 'k3-256k', name: 'Kimi K3-256K', contextWindow: 262144, thinkingCapability: { depths } },
]
const exported = [
  { id: 'newapi/glm-5.3-flash', context: 1000000, efforts: depths, images: true, tools: true },
  { id: 'zcode/GLM-5.3-Flash', context: 1000000, efforts: depths, images: true, tools: true },
  { id: 'kimi/k3', context: 1048576, efforts: depths, images: false, tools: true },
]
const providers = { groups: [
  { id: 'fast', name: 'anything', members: ['newapi/glm-5.3-flash', 'zcode/GLM-5.3-Flash'] },
  { id: 'kimi', members: ['kimi/k3'] },
] }
const plan = options => resolve({ ids: [GROUP], catalog, exported, providers, ...options })

test('identity normalizes formatting and exact Kimi aliases without dropping versions or variants', () => {
  assert.equal(modelIdentity('GLM 5.3 Flash'), GLM)
  assert.equal(modelIdentity('Kimi-K3'), 'kimi-k3')
  assert.equal(modelIdentity('k3'), 'kimi-k3')
  assert.notEqual(modelIdentity('k3.1-pro'), modelIdentity('k3'))
  assert.notEqual(modelIdentity('K3-256K'), modelIdentity('k3'))
  assert.notEqual(modelIdentity('GLM-5.3'), GLM)
  assert.equal(modelIdentity('fastest model'), null)
})

test('all groups and single models get independent official references without changing wire IDs', () => {
  const p = plan({ ids: [GROUP, 'group/kimi', 'newapi/glm-5.3-flash', 'kimi/k3'] })
  assert.deepEqual(p.refs, { [GROUP]: ZAI, 'group/kimi': KIMI, 'newapi/glm-5.3-flash': ZAI, 'kimi/k3': KIMI })
  assert.ok(p.entries.every(e => e.status === 'matched' && e.source === 'automatic'))
})

test('official preference is independent of catalog order', () => {
  assert.equal(plan().refs[GROUP], ZAI)
  assert.equal(plan({ catalog: [...catalog].reverse() }).refs[GROUP], ZAI)
})

test('keyword similarity never maps k3.1-pro to k3 or context variants to full-context models', () => {
  const p = plan({ ids: ['kimi/k3.1-pro', 'kimi/k3-256k'] })
  assert.equal(p.refs['kimi/k3.1-pro'], undefined)
  assert.equal(p.entries[0].status, 'no-official-match')
  assert.equal(p.refs['kimi/k3-256k'], 'kimi-coding/k3-256k')
})

test('arbitrary and misleading group names do not override actual members', () => {
  const p = plan({ providers: { groups: [{ id: 'fast', name: 'Kimi K3', members: ['newapi/glm-5.3-flash'] }] } })
  assert.equal(p.refs[GROUP], ZAI)
})

test('mixed group remains unmapped and reports candidates and shared capabilities', () => {
  const p = plan({ providers: { groups: [{ id: 'fast', members: ['newapi/glm-5.3-flash', 'kimi/k3'] }] } })
  assert.deepEqual(p.refs, {})
  const entry = p.entries[0]
  assert.equal(entry.status, 'mixed-models')
  assert.deepEqual(entry.identities, [GLM, 'kimi-k3'])
  assert.equal(entry.commonCapabilities.contextWindow, 1000000)
  assert.equal(entry.commonCapabilities.images, false)
  assert.ok(entry.warnings.includes('member-images-support-differs'))
  assert.deepEqual(entry.commonCapabilities.thinkingLevels, depths)
  assert.ok(entry.candidates.includes(ZAI) && entry.candidates.includes(KIMI))
})

test('homogeneous group with narrower member context is blocked and explained', () => {
  const p = plan({ exported: exported.map(m => m.id.startsWith('zcode/') ? { ...m, context: 262144 } : m) })
  assert.deepEqual(p.refs, {})
  assert.equal(p.entries[0].status, 'capability-mismatch')
  assert.ok(p.entries[0].warnings.includes('reference-context-exceeds-member-limit'))
  assert.equal(p.entries[0].commonCapabilities.contextWindow, 262144)
})

test('thinking levels use the intersection; the catalog must not advertise additional depths', () => {
  const p = plan({ exported: exported.map(m => m.id.startsWith('zcode/') ? { ...m, efforts: ['low'] } : m) })
  assert.equal(p.entries[0].status, 'capability-mismatch')
  assert.deepEqual(p.entries[0].commonCapabilities.thinkingLevels, ['low'])
  assert.equal(p.refs[GROUP], undefined)
})

test('unknown member identity prevents automatic mapping even with a known group label', () => {
  const p = plan({ providers: { groups: [{ id: 'fast', name: 'GLM-5.3-Flash', members: ['newapi/glm-5.3-flash', 'other/unknown'] }] } })
  assert.equal(p.entries[0].status, 'unrecognized-model')
  assert.deepEqual(p.refs, {})
})

test('missing, null or empty membership is not assumed to be homogeneous', () => {
  for (const providers of [null, {}, { groups: [] }, { groups: [{ id: 'fast', members: null }] }, { groups: [{ id: 'fast', members: [] }] }]) {
    const p = plan({ providers, exported: [{ id: GROUP, name: 'GLM-5.3-Flash · routing group' }] })
    assert.equal(p.entries[0].status, 'membership-unavailable')
    assert.deepEqual(p.refs, {})
  }
})

test('nested groups resolve independently; cyclic or malformed graphs cannot auto-map', () => {
  const nested = { groups: [...providers.groups, { id: 'nested', members: [GROUP, 'group/kimi'] }] }
  const p = plan({ ids: ['group/nested', GROUP], providers: nested })
  assert.equal(p.entries[0].status, 'mixed-models')
  assert.equal(p.refs[GROUP], ZAI)
  const cycle = plan({ providers: { groups: [{ id: 'fast', members: [GROUP] }] } })
  assert.equal(cycle.entries[0].status, 'cyclic-group')
  assert.deepEqual(cycle.refs, {})
  assert.equal(plan({ providers: { groups: [{ id: 'fast', members: ['not-a-route'] }] } }).entries[0].status, 'invalid-member')
})

test('legacy opencode reference upgrades to official; known automatic reference follows future changes', () => {
  const id = 'group/glm-5.3-flash'
  const groupConfig = { groups: [{ id: GLM, members: ['newapi/glm-5.3-flash'] }] }
  const p = plan({ ids: [id], providers: groupConfig, existing: { [id]: OPEN } })
  assert.equal(p.refs[id], ZAI)
  assert.equal(p.entries[0].source, 'automatic')
  const changed = plan({ ids: [id], existing: p.refs, previous: p.provenance,
    providers: { groups: [{ id: GLM, members: ['kimi/k3'] }] } })
  assert.equal(changed.refs[id], KIMI)
})

test('automatic reference is removed when a previously homogeneous group becomes mixed', () => {
  const p = plan()
  const changed = plan({ existing: p.refs, previous: p.provenance,
    providers: { groups: [{ id: 'fast', members: ['newapi/glm-5.3-flash', 'kimi/k3'] }] } })
  assert.equal(changed.entries[0].status, 'mixed-models')
  assert.deepEqual(changed.refs, {})
})

test('explicit existing mapping for a mixed group is preserved and identified as manual', () => {
  const p = plan({ existing: { [GROUP]: ZAI }, providers: { groups: [{ id: 'fast', members: ['newapi/glm-5.3-flash', 'kimi/k3'] }] } })
  assert.equal(p.refs[GROUP], ZAI)
  assert.equal(p.entries[0].source, 'manual')
  assert.equal(p.entries[0].status, 'mixed-models')
})

test('manual edits and manual clearing survive later syncs and group changes', () => {
  const p = plan()
  for (const value of [KIMI, null]) {
    const existing = value ? { [GROUP]: value } : {}
    const edit = plan({ existing, previous: p.provenance })
    assert.equal(edit.provenance.manual[GROUP], value)
    assert.equal(edit.refs[GROUP] ?? null, value)
    const again = plan({ existing: edit.refs, previous: edit.provenance })
    assert.equal(again.refs[GROUP] ?? null, value)
    assert.equal(again.entries[0].source, 'manual')
  }
})

test('option overrides support explicit aliases and disabling mapping without guessing', () => {
  const p = plan({ ids: ['kimi/k3.1-pro', GROUP], overrides: { 'kimi/k3.1-pro': KIMI, [GROUP]: null } })
  assert.deepEqual(p.refs, { 'kimi/k3.1-pro': KIMI })
  assert.equal(p.entries[0].source, 'option')
  assert.equal(p.entries[1].source, 'option')
  assert.throws(() => plan({ overrides: { [GROUP]: 'nonexistent/model' } }), /unknown capability/)
})

test('pending reference write is recovered after response loss instead of misclassified as a manual edit', () => {
  const before = plan()
  const after = plan({ existing: before.refs, previous: before.provenance,
    providers: { groups: [{ id: 'fast', members: ['kimi/k3'] }] } })
  const recovered = plan({ existing: after.refs,
    providers: { groups: [{ id: 'fast', members: ['kimi/k3'] }] },
    previous: { ...before.provenance, pending: { refs: after.refs, provenance: after.provenance } } })
  assert.deepEqual(recovered.provenance.automatic, { [GROUP]: KIMI })
  assert.deepEqual(recovered.provenance.manual, {})
})

test('pending recovery distinguishes a concurrent manual edit in another group', () => {
  const ids = [GROUP, 'group/kimi']
  const before = plan({ ids })
  const changedProviders = { groups: [{ id: 'fast', members: ['kimi/k3'] }, providers.groups[1]] }
  const after = plan({ ids, providers: changedProviders, existing: before.refs, previous: before.provenance })
  const recovered = plan({ ids, providers: changedProviders,
    existing: { ...after.refs, 'group/kimi': ZAI },
    previous: { ...before.provenance, pending: { refs: after.refs, provenance: after.provenance } } })
  assert.equal(recovered.provenance.automatic[GROUP], KIMI)
  assert.equal(recovered.provenance.manual['group/kimi'], ZAI)
})

test('catalog outage retains references without permanently classifying legacy mappings as manual', () => {
  const id = 'newapi/glm-5.3-flash'
  const p = plan({ ids: [id], catalog: null, existing: { [id]: OPEN } })
  assert.equal(p.refs[id], OPEN)
  assert.deepEqual(p.provenance.manual, {})
  const recovered = plan({ ids: [id], existing: p.refs, previous: p.provenance })
  assert.equal(recovered.refs[id], ZAI)
})

test('temporarily missing group snapshot retains tracked references for recovery', () => {
  const p = plan()
  const missing = plan({ providers: null, existing: p.refs, previous: p.provenance })
  assert.equal(missing.refs[GROUP], ZAI)
  assert.equal(missing.entries[0].status, 'membership-unavailable')
  assert.deepEqual(missing.provenance.automatic, p.provenance.automatic)
})

test('partial provider metadata does not turn a blocked mapping into an automatic reference', () => {
  const p = plan({ metadataUnavailable: true })
  assert.deepEqual(p.refs, {})
  assert.equal(p.entries[0].status, 'metadata-unavailable')
  const existing = plan({ metadataUnavailable: true, existing: { [GROUP]: ZAI }, previous: { automatic: { [GROUP]: ZAI }, manual: {} } })
  assert.equal(existing.refs[GROUP], ZAI)
})

test('official priority can be configured; third-party-only matches remain suggestions', () => {
  assert.equal(plan({ officialProviders: ['zai-coding-cn', 'zai'] }).refs[GROUP], `zai-coding-cn/${GLM}`)
  const p = plan({ catalog: catalog.filter(c => c.provider === 'opencode') })
  assert.equal(p.entries[0].status, 'no-official-match')
  assert.deepEqual(p.refs, {})
  assert.deepEqual(p.entries[0].candidates, [OPEN])
})

test('provider model metadata fills non-exported members; no secret-bearing fields enter the report', () => {
  const p = plan({ exported: [], pluginProviders: [{ id: 'newapi', apiKey: 'TOP-SECRET', api: 'https://private.invalid',
    models: [{ id: GLM, context: 1000000, efforts: depths }] }, { id: 'zcode', models: [{ id: 'GLM-5.3-Flash', context: 1000000, efforts: depths }] }] })
  assert.equal(p.refs[GROUP], ZAI)
  assert.equal(p.entries[0].commonCapabilities.contextComplete, true)
  assert.ok(!JSON.stringify(p).includes('TOP-SECRET') && !JSON.stringify(p).includes('private.invalid'))
})

test('unknown capabilities are reported as unknown, never advertised as a verified intersection', () => {
  const p = plan({ exported: [] })
  assert.equal(p.refs[GROUP], ZAI)
  assert.equal(p.entries[0].commonCapabilities.thinkingLevels, null)
  assert.equal(p.entries[0].commonCapabilities.contextComplete, false)
  assert.ok(p.entries[0].warnings.includes('member-capabilities-incomplete'))
})

test('conflicting recognized model ID and name are not silently treated as aliases', () => {
  const p = plan({ ids: ['kimi/k3'], exported: [{ id: 'kimi/k3', name: 'Kimi K3-256K' }] })
  assert.equal(p.refs['kimi/k3'], undefined)
  assert.equal(p.entries[0].status, 'unrecognized-model')
})

test('references and provenance for removed routes are pruned', () => {
  const p = plan({ ids: ['kimi/k3'], existing: { [GROUP]: ZAI, 'kimi/k3': KIMI },
    previous: { automatic: { [GROUP]: ZAI }, manual: {} } })
  assert.deepEqual(p.refs, { 'kimi/k3': KIMI })
  assert.equal(p.provenance.automatic[GROUP], undefined)
})
