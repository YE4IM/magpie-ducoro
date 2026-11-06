import test from 'node:test'
import assert from 'node:assert/strict'
import { compatiblePreference, createModelSync } from '../model-sync.mjs'

const OLD = 'group/never-stuck'
const MODEL = 'group/glm-5.3-flash'
const OTHER = 'kimi/k3.1-pro'
const SLUG = 'magpie-ducoro'
const capability = { depths: ['low', 'high', 'max'], canDisable: false }
const bot = (id, model = OLD, extra = {}) => ({ id, name: id, profile: 'user profile', modelPreference: {
  runtime: 'pi-agent', connectionSlug: SLUG, model, thinkingLevel: 'max', ...extra,
} })

function fixture(bots = [bot('agt-one')], options = {}) {
  const state = {}
  const connection = { slug: SLUG, baseUrl: 'http://127.0.0.1:3425/v1', defaultModel: MODEL, models: [MODEL, OTHER] }
  const infos = [
    { id: MODEL, thinkingCapability: capability },
    { id: OTHER, thinkingCapability: { depths: [], canDisable: false } },
  ]
  const calls = [], retries = [], logs = [], saves = []
  const f = { state, bots: structuredClone(bots), connection, infos, calls, retries, logs, saves, current: true }
  const run = async args => {
    calls.push(structuredClone(args))
    const intercepted = await f.intercept?.(args)
    if (intercepted) return intercepted
    let json
    if (args[0] === 'connections') json = [{ ...connection, availableModelInfos: f.infos }]
    else if (args[1] === 'list') json = { agents: structuredClone(f.bots) }
    else if (args[1] === 'get') json = { agent: structuredClone(f.bots.find(b => b.id === args[2])) }
    else if (args[1] === 'update') {
      const b = f.bots.find(b => b.id === args[2])
      Object.assign(b, JSON.parse(args[4]))
      json = { agent: structuredClone(b) }
    } else throw Error(`unexpected command: ${args}`)
    return { ok: true, json }
  }
  Object.assign(f, createModelSync({
    opts: { syncAgentModels: true, targetAgents: [], ...options }, run, getState: () => state,
    save: async () => { saves.push(structuredClone(state)) },
    requestRetry: reason => retries.push(reason), log: message => logs.push(message), isCurrent: () => f.current,
  }))
  f.updates = () => calls.filter(args => args[0] === 'agent' && args[1] === 'update')
  return f
}

test('thinking levels follow effective capabilities including off/on models', () => {
  const pref = bot('agt-one').modelPreference
  assert.equal(compatiblePreference(pref, MODEL, { thinkingCapability: capability }).thinkingLevel, 'max')
  assert.equal(compatiblePreference(pref, MODEL, {}).thinkingLevel, undefined)
  for (const thinkingLevel of ['off', 'on']) {
    assert.equal(compatiblePreference({ ...pref, thinkingLevel }, MODEL, { thinkingCapability: { depths: [], canDisable: true } }).thinkingLevel, thinkingLevel)
  }
  assert.equal(compatiblePreference({ ...pref, thinkingLevel: 'on' }, MODEL, { thinkingCapability: { ...capability, canDisable: true } }).thinkingLevel, undefined)
})

test('upgrade repairs obsolete Bot ID even when connection is already up to date; repeat is idempotent', async () => {
  const f = fixture()
  await f.sync(f.connection)
  assert.deepEqual(f.bots[0].modelPreference, { runtime: 'pi-agent', connectionSlug: SLUG, model: MODEL, thinkingLevel: 'max' })
  assert.equal(f.bots[0].profile, 'user profile')
  assert.equal(f.updates().length, 1)
  await f.sync(f.connection)
  assert.equal(f.updates().length, 1)
})

test('old default follows selection even if still available; valid custom model is retained', async () => {
  const f = fixture([bot('agt-follow'), bot('agt-custom', OTHER, { thinkingLevel: undefined })])
  f.connection.models.push(OLD)
  f.infos.push({ id: OLD, thinkingCapability: capability })
  await f.prepare(SLUG, MODEL, OLD)
  assert.deepEqual(f.saves[0].modelMigration, { slug: SLUG, target: MODEL, from: [OLD] })
  await f.sync(f.connection)
  assert.equal(f.bots[0].modelPreference.model, MODEL)
  assert.equal(f.bots[1].modelPreference.model, OTHER)
  assert.equal(f.updates().length, 1)
  assert.equal(f.state.modelMigration, undefined)
})

test('other Connections, runtimes and agents outside targetAgents are untouched', async () => {
  const f = fixture([
    bot('agt-target'), bot('agt-excluded'), bot('agt-other', OLD, { connectionSlug: 'other' }), bot('agt-runtime', OLD, { runtime: 'codex' }),
  ], { targetAgents: ['agt-target', 'agt-other', 'agt-runtime'] })
  await f.sync(f.connection)
  assert.deepEqual(f.updates().map(args => args[2]), ['agt-target'])
})

test('unsupported thinking and speed overrides use target defaults on model change', async () => {
  const f = fixture([bot('agt-one', OLD, { speedMode: 'fast' })])
  f.infos[0].thinkingCapability = { depths: ['low'], canDisable: false }
  await f.sync(f.connection)
  assert.deepEqual(f.bots[0].modelPreference, { runtime: 'pi-agent', connectionSlug: SLUG, model: MODEL })
})

test('unresolved capabilities on an unchanged custom model clear invalid thinking only', async () => {
  const f = fixture([bot('agt-one', MODEL)])
  f.infos[0].thinkingCapability = { depths: [], canDisable: false }
  await f.sync(f.connection)
  assert.equal(f.bots[0].modelPreference.thinkingLevel, undefined)
  assert.equal(f.bots[0].modelPreference.model, MODEL)
})

test('failed Bot update retains transition; retry after restart still follows the old default', async () => {
  const f = fixture()
  f.connection.models.push(OLD)
  await f.prepare(SLUG, MODEL, OLD)
  f.intercept = async args => args[1] === 'update' ? { ok: false } : null
  await f.sync(f.connection)
  assert.ok(f.state.modelMigration)
  assert.deepEqual(f.retries, ['bot-model-sync'])
  const restarted = fixture()
  restarted.connection.models.push(OLD)
  Object.assign(restarted.state, structuredClone(f.state))
  await restarted.prepare(SLUG, MODEL, MODEL)
  await restarted.sync(restarted.connection)
  assert.equal(restarted.bots[0].modelPreference.model, MODEL)
  assert.equal(restarted.state.modelMigration, undefined)
})

test('lost update response is recovered by reading current Bot state before retry', async () => {
  const f = fixture()
  await f.prepare(SLUG, MODEL, OLD)
  f.intercept = async args => {
    if (args[1] !== 'update') return null
    f.bots[0].modelPreference = JSON.parse(args[4]).modelPreference
    return { ok: false }
  }
  await f.sync(f.connection)
  f.intercept = null
  await f.sync(f.connection)
  assert.equal(f.updates().length, 1)
  assert.equal(f.state.modelMigration, undefined)
})

test('one failed Bot does not prevent other Bots from being repaired', async () => {
  const f = fixture([bot('agt-bad'), bot('agt-good')])
  f.intercept = async args => args[1] === 'update' && args[2] === 'agt-bad' ? { ok: false } : null
  await f.sync(f.connection)
  assert.equal(f.bots[1].modelPreference.model, MODEL)
  assert.equal(f.bots[0].modelPreference.model, OLD)
})

test('fresh get respects an operator changing the Bot connection after roster read', async () => {
  const f = fixture()
  f.intercept = async args => {
    if (args[0] === 'agent' && args[1] === 'get') f.bots[0].modelPreference.connectionSlug = 'manual'
  }
  await f.sync(f.connection)
  assert.equal(f.updates().length, 0)
})

test('missing capabilities defer migration instead of guessing thinking support', async () => {
  const f = fixture()
  await f.prepare(SLUG, MODEL, OLD)
  f.infos = []
  await f.sync(f.connection)
  assert.equal(f.updates().length, 0)
  assert.ok(f.state.modelMigration)
})

test('stale connection projection blocks Bot mutations', async () => {
  const f = fixture()
  f.intercept = async args => args[0] === 'connections' ? { ok: true, json: [{ ...f.connection, defaultModel: OLD, availableModelInfos: f.infos }] } : null
  await assert.rejects(f.sync(f.connection), /projection/)
  assert.equal(f.updates().length, 0)
})

test('changed capability references in status projection block Bot mutations', async () => {
  const f = fixture()
  f.connection.modelCapabilityRefs = { [MODEL]: 'zai/glm-5.3-flash' }
  f.intercept = async args => args[0] === 'connections' ? { ok: true, json: [{ ...f.connection,
    modelCapabilityRefs: { [MODEL]: 'other/model' }, availableModelInfos: f.infos,
  }] } : null
  await assert.rejects(f.sync(f.connection), /projection/)
  assert.equal(f.updates().length, 0)
})

test('verification mismatch retains transition for reconciliation', async () => {
  const f = fixture()
  await f.prepare(SLUG, MODEL, OLD)
  f.intercept = async args => args[1] === 'update' ? { ok: true, json: {} } : null
  await f.sync(f.connection)
  assert.ok(f.state.modelMigration)
  assert.equal(f.retries.length, 1)
})

test('two selection changes retain pending intermediate model IDs', async () => {
  const f = fixture()
  await f.prepare(SLUG, MODEL, OLD)
  await f.prepare(SLUG, OTHER, MODEL)
  assert.deepEqual(f.state.modelMigration, { slug: SLUG, target: OTHER, from: [OLD, MODEL] })
})

test('disabled and dry-run sync issue no Bot commands or state writes', async () => {
  for (const options of [{ syncAgentModels: false }, { dryRun: true }]) {
    const f = fixture(undefined, options)
    await f.prepare(SLUG, MODEL, OLD)
    await f.sync(f.connection)
    assert.equal(f.calls.length, 0)
    assert.equal(f.saves.length, 0)
  }
})

test('superseded gateway prevents Bot writes and retains pending state', async () => {
  const f = fixture()
  await f.prepare(SLUG, MODEL, OLD)
  f.intercept = async args => { if (args[0] === 'agent' && args[1] === 'get') f.current = false }
  await f.sync(f.connection)
  assert.equal(f.updates().length, 0)
  assert.ok(f.state.modelMigration)
})
