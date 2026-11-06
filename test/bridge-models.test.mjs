import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _internal } from '../bridge.mjs'

const OLD = 'group/never-stuck'
const MODEL = 'group/glm-5.3-flash'
const REF = 'zai/glm-5.3-flash'
const KEY = 'fixture-key-not-a-real-credential'
const BASE = 'http://127.0.0.1:3425/v1'
const SLUG = 'magpie-ducoro'

// Exercise the real engine, CLI spawning, JSON envelopes, stdin credentials,
// state file persistence and restart behavior without contacting a daemon/LLM.
async function fixture(t, { previous = MODEL, absent = false, owned = true, ...flags } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'ducoro-031-test-'))
  const stateDir = join(root, 'state')
  await mkdir(stateDir)
  const bridgeFile = join(root, 'magpie-agent.json')
  const database = join(root, 'fake-cli.json')
  const env = {
    DUCORO_BRIDGE_FILE: bridgeFile, DUCORO_BRIDGE_MCP_FILE: join(root, 'mcp.json'),
    DUCORO_BRIDGE_SKILLS_DIR: join(root, 'skills'), DUCORO_BRIDGE_STATE_DIR: stateDir,
    DUCORO_BRIDGE_LIBRARY_FILE: join(root, 'library.json'),
    DUCORO_BRIDGE_LIBRARY_SKILLS_DIR: join(root, 'library-skills'),
    DUCORO_BRIDGE_INSTRUCTIONS_FILE: join(root, 'instructions.md'), DUCORO_BRIDGE_DUCORO_HOME: root,
    DUCORO_BRIDGE_PROVIDERS_FILE: join(root, 'providers.json'),
    DUCORO_BRIDGE_PLUGIN_PROVIDERS_FILE: join(root, 'plugin-providers.json'),
  }
  const savedEnv = Object.fromEntries(Object.keys(env).map(k => [k, process.env[k]]))
  Object.assign(process.env, env)
  t.after(async () => {
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
    await rm(root, { recursive: true, force: true })
  })
  const input = { gateway: { url: 'http://127.0.0.1:3425', v1: BASE, key: KEY }, model: MODEL, models: [{ id: MODEL }] }
  await writeFile(bridgeFile, JSON.stringify(input))
  await writeFile(env.DUCORO_BRIDGE_LIBRARY_FILE, '{}')
  await writeFile(env.DUCORO_BRIDGE_PROVIDERS_FILE, JSON.stringify({ groups: [
    { id: 'glm-5.3-flash', members: ['newapi/glm-5.3-flash'] },
    { id: 'never-stuck', members: ['newapi/glm-5.3-flash'] },
  ] }))
  await writeFile(env.DUCORO_BRIDGE_PLUGIN_PROVIDERS_FILE, '[]')
  const data = {
    connection: absent ? null : { slug: SLUG, name: 'Magpie gateway', consumedBy: 'pi-agent', baseUrl: BASE,
      defaultModel: previous, models: [previous], modelCapabilityRefs: { [previous]: REF } },
    bots: [{ id: 'agt-one', profile: 'keep profile', modelPreference: {
      runtime: 'pi-agent', connectionSlug: SLUG, model: OLD, thinkingLevel: 'max',
    } }],
    calls: [], ...flags,
  }
  await writeFile(database, JSON.stringify(data))
  if (owned) await writeFile(join(stateDir, 'state.json'), JSON.stringify({ v: 2, connection: {
    slug: SLUG, keyHash: _internal.sha256(KEY), baseUrl: BASE, model: previous,
  }, mcp: {}, skills: {} }))
  const cli = join(root, 'fake-ducoro-cli')
  await writeFile(cli, `#!${process.execPath}
const fs = require('node:fs');
const file = ${JSON.stringify(database)};
const data = JSON.parse(fs.readFileSync(file, 'utf8'));
const args = process.argv.slice(2).filter(a => a !== '--json');
const flag = name => args[args.indexOf(name) + 1];
data.calls.push(args);
let result = null, code = 0;
const fail = message => { code = 1; result = { error: { code: 'HANDLER_ERROR', message } }; };
if (args[0] === 'mcp' || args[0] === 'skill') result = [];
else if (args[0] === 'connections') {
  if (args[1] === 'get') {
    if (data.connection) result = { connection: data.connection };
    else fail('no connection');
  } else if (args[1] === 'catalog') {
    result = [
      { provider: 'opencode', id: 'glm-5.3-flash', name: 'GLM-5.3-Flash' },
      { provider: 'zai', id: 'glm-5.3-flash', name: 'GLM-5.3-Flash' },
      { provider: 'kimi-coding', id: 'k3', name: 'Kimi K3' },
    ];
  } else if (args[1] === 'list') result = [{ ...data.connection, availableModelInfos: (data.connection.models ?? []).map(id => ({
    id, thinkingCapability: { depths: ['low', 'high', 'max'], canDisable: false },
  })) }];
  else if (['update-apikey', 'add-apikey'].includes(args[1])) {
    const stdin = fs.readFileSync(0, 'utf8').trim();
    if (stdin !== ${JSON.stringify(KEY)}) fail('wrong credential transport');
    else if (data.failConnection) fail('probe failed');
    else {
      data.connection = { slug: ${JSON.stringify(SLUG)}, consumedBy: 'pi-agent', name: flag('--name'), baseUrl: flag('--base-url'),
        defaultModel: flag('--model'), models: flag('--models').split(','),
        modelCapabilityRefs: Object.fromEntries(flag('--capability-refs').split(',').filter(Boolean).map(p => p.split('='))) };
      result = { connection: data.connection };
    }
  } else fail('unexpected connections command');
} else if (args[0] === 'agent') {
  if (args[1] === 'list') result = { agents: data.bots };
  else if (args[1] === 'get') result = { agent: data.bots.find(b => b.id === args[2]) };
  else if (args[1] === 'update') {
    if (data.failBot) fail('Bot temporarily unavailable');
    else {
      const bot = data.bots.find(b => b.id === args[2]);
      Object.assign(bot, JSON.parse(flag('--patch'))); result = { agent: bot };
    }
  } else fail('unexpected agent command');
} else fail('unexpected command');
fs.writeFileSync(file, JSON.stringify(data));
process.stdout.write(JSON.stringify(result)); process.exitCode = code;
`, { mode: 0o700 })
  const create = options => {
    const engine = _internal.createEngine({ directory: root }, {
      cli, syncMcp: false, syncSkills: false, syncInstructions: false, syncSubagents: false, ...options,
    })
    t.after(() => engine.stop())
    return engine
  }
  return {
    create, input, bridgeFile, providersFile: env.DUCORO_BRIDGE_PROVIDERS_FILE,
    capabilityReport: async () => JSON.parse(await readFile(join(stateDir, 'model-capabilities.json'), 'utf8')),
    read: async () => JSON.parse(await readFile(database, 'utf8')),
    write: async data => writeFile(database, JSON.stringify(data)),
    state: async () => JSON.parse(await readFile(join(stateDir, 'state.json'), 'utf8')),
  }
}

test('0.3.0 upgrade repairs stale Bot even with an unchanged connection', async t => {
  const f = await fixture(t)
  const engine = f.create()
  await engine.syncAll('test')
  const data = await f.read()
  assert.equal(data.bots[0].modelPreference.model, MODEL)
  assert.equal(data.bots[0].modelPreference.thinkingLevel, 'max')
  assert.equal(data.bots[0].profile, 'keep profile')
  assert.equal(data.connection.modelCapabilityRefs[MODEL], REF)
  assert.equal(data.calls.filter(a => a[1] === 'update-apikey').length, 0)
  await engine.syncAll('test-again')
  assert.equal((await f.read()).calls.filter(a => a[0] === 'agent' && a[1] === 'update').length, 1)
})

test('failed connection probe leaves Bot untouched; retry updates route before Bot', async t => {
  const f = await fixture(t, { previous: OLD, failConnection: true })
  await f.create().syncAll('test')
  let data = await f.read()
  assert.equal(data.connection.defaultModel, OLD)
  assert.equal(data.bots[0].modelPreference.model, OLD)
  assert.ok((await f.state()).modelMigration)
  data.failConnection = false
  data.calls = []
  await f.write(data)
  await f.create().syncAll('retry')
  data = await f.read()
  assert.equal(data.connection.defaultModel, MODEL)
  assert.equal(data.bots[0].modelPreference.model, MODEL)
  assert.ok(data.calls.findIndex(a => a[1] === 'update-apikey') < data.calls.findIndex(a => a[0] === 'agent' && a[1] === 'update'))
  assert.equal((await f.state()).modelMigration, undefined)
})

test('pending Bot migration survives process restart when old default remains allowed', async t => {
  const f = await fixture(t, { previous: OLD, failBot: true })
  f.input.models.push({ id: OLD, name: 'GLM-5.3-Flash · routing group' })
  await writeFile(f.bridgeFile, JSON.stringify(f.input))
  await f.create().syncAll('test')
  let data = await f.read()
  assert.equal(data.connection.defaultModel, MODEL)
  assert.equal(data.bots[0].modelPreference.model, OLD)
  assert.deepEqual((await f.state()).modelMigration.from, [OLD])
  data.failBot = false
  await f.write(data)
  await f.create().syncAll('restart')
  data = await f.read()
  assert.equal(data.bots[0].modelPreference.model, MODEL)
  assert.equal((await f.state()).modelMigration, undefined)
})

test('new connection is verified before stale Bot is repaired', async t => {
  const f = await fixture(t, { absent: true })
  await f.create().syncAll('create')
  const data = await f.read()
  assert.equal(data.connection.defaultModel, MODEL)
  assert.equal(data.bots[0].modelPreference.model, MODEL)
  assert.equal(data.calls.filter(a => a[1] === 'add-apikey').length, 1)
})

test('syncAgentModels=false continues connection sync without touching Bot preferences', async t => {
  const f = await fixture(t, { previous: OLD })
  await f.create({ syncAgentModels: false }).syncAll('test')
  const data = await f.read()
  assert.equal(data.connection.defaultModel, MODEL)
  assert.equal(data.bots[0].modelPreference.model, OLD)
  assert.equal(data.calls.filter(a => a[0] === 'agent').length, 0)
})

test('incomplete Magpie export does not replace route or Bot', async t => {
  const f = await fixture(t, { previous: OLD })
  f.input.models = [{ id: OLD }]
  await writeFile(f.bridgeFile, JSON.stringify(f.input))
  await f.create().syncAll('partial-export')
  const data = await f.read()
  assert.equal(data.connection.defaultModel, OLD)
  assert.equal(data.calls.filter(a => a[0] === 'connections').length, 0)
  assert.equal(data.bots[0].modelPreference.model, OLD)
})

test('unowned foreign connection is not adopted or used for Bot migration', async t => {
  const f = await fixture(t, { owned: false })
  const data = await f.read()
  data.connection.baseUrl = 'http://other.invalid/v1'
  await f.write(data)
  await f.create().syncAll('test')
  const result = await f.read()
  assert.equal(result.connection.baseUrl, 'http://other.invalid/v1')
  assert.equal(result.calls.filter(a => a[0] === 'agent' || a[1] === 'update-apikey').length, 0)
})

test('dry-run does not invoke CLI or persist migrations', async t => {
  const f = await fixture(t)
  await f.create({ dryRun: true }).syncAll('dry-run')
  assert.deepEqual((await f.read()).calls, [])
  assert.equal((await f.state()).modelMigration, undefined)
})

test('all exported groups map independently and a membership change removes only the affected automatic reference', async t => {
  const f = await fixture(t, { absent: true })
  f.input.models.push({ id: 'group/kimi' })
  const groups = [
    { id: 'glm-5.3-flash', members: ['newapi/glm-5.3-flash'] },
    { id: 'kimi', members: ['kimi/k3'] },
  ]
  await writeFile(f.bridgeFile, JSON.stringify(f.input))
  await writeFile(f.providersFile, JSON.stringify({ groups }))
  const engine = f.create()
  await engine.syncAll('all-groups')
  let data = await f.read()
  assert.deepEqual(data.connection.modelCapabilityRefs, { [MODEL]: REF, 'group/kimi': 'kimi-coding/k3' })
  assert.equal((await f.capabilityReport()).applied, true)
  groups[0].members.push('kimi/k3')
  await writeFile(f.providersFile, JSON.stringify({ groups }))
  await engine.syncAll('changed-members')
  data = await f.read()
  assert.deepEqual(data.connection.modelCapabilityRefs, { 'group/kimi': 'kimi-coding/k3' })
  assert.equal(data.connection.defaultModel, MODEL)
  assert.equal((await f.capabilityReport()).entries[0].status, 'mixed-models')
  assert.equal((await f.state()).modelCapabilities.pending, undefined)
})

test('legacy mapping upgrades to official and subsequent manual edits survive restart', async t => {
  const f = await fixture(t)
  let data = await f.read()
  data.connection.modelCapabilityRefs[MODEL] = 'opencode/glm-5.3-flash'
  await f.write(data)
  await f.create().syncAll('legacy-upgrade')
  data = await f.read()
  assert.equal(data.connection.modelCapabilityRefs[MODEL], REF)
  assert.equal((await f.state()).modelCapabilities.automatic[MODEL], REF)
  data.connection.modelCapabilityRefs[MODEL] = 'kimi-coding/k3'
  await f.write(data)
  await f.create().syncAll('operator-edit')
  assert.equal((await f.read()).connection.modelCapabilityRefs[MODEL], 'kimi-coding/k3')
  assert.equal((await f.state()).modelCapabilities.manual[MODEL], 'kimi-coding/k3')
  await f.create().syncAll('restart')
  assert.equal((await f.read()).connection.modelCapabilityRefs[MODEL], 'kimi-coding/k3')
})

test('failed reference write stays pending; report and provenance commit only after verified retry', async t => {
  const f = await fixture(t, { failConnection: true })
  let data = await f.read()
  data.connection.modelCapabilityRefs[MODEL] = 'opencode/glm-5.3-flash'
  await f.write(data)
  await f.create().syncAll('failed-upgrade')
  assert.equal((await f.capabilityReport()).applied, false)
  assert.equal((await f.state()).modelCapabilities.pending.refs[MODEL], REF)
  data = await f.read()
  assert.equal(data.connection.modelCapabilityRefs[MODEL], 'opencode/glm-5.3-flash')
  data.failConnection = false
  await f.write(data)
  await f.create().syncAll('retry')
  assert.equal((await f.read()).connection.modelCapabilityRefs[MODEL], REF)
  assert.equal((await f.capabilityReport()).applied, true)
  assert.equal((await f.state()).modelCapabilities.pending, undefined)
})

test('explicit mixed-group override is persisted and identified in the report', async t => {
  const f = await fixture(t, { absent: true })
  await writeFile(f.providersFile, JSON.stringify({ groups: [{ id: 'glm-5.3-flash', members: ['newapi/glm-5.3-flash', 'kimi/k3'] }] }))
  await f.create({ modelCapabilityRefs: { [MODEL]: REF } }).syncAll('override')
  assert.equal((await f.read()).connection.modelCapabilityRefs[MODEL], REF)
  const report = await f.capabilityReport()
  assert.equal(report.entries[0].status, 'mixed-models')
  assert.equal(report.entries[0].source, 'option')
})

test('malformed metadata retains existing references and refreshes after file recovery', async t => {
  const f = await fixture(t, { absent: true })
  const engine = f.create()
  await engine.syncAll('initial')
  await writeFile(f.providersFile, '{partial')
  await engine.syncAll('partial-metadata')
  assert.equal((await f.read()).connection.modelCapabilityRefs[MODEL], REF)
  assert.equal((await f.capabilityReport()).entries[0].status, 'metadata-unavailable')
  await writeFile(f.providersFile, JSON.stringify({ groups: [{ id: 'glm-5.3-flash', members: ['kimi/k3'] }] }))
  await engine.syncAll('recovered-metadata')
  assert.equal((await f.read()).connection.modelCapabilityRefs[MODEL], 'kimi-coding/k3')
})

test('filesystem watcher reconciles member changes without a model selection event or manual sync', async t => {
  const f = await fixture(t, { absent: true })
  const engine = f.create()
  const until = async predicate => {
    const deadline = Date.now() + 15000
    while (Date.now() < deadline) {
      try { if (await predicate()) return } catch (error) {
        if (!(error instanceof SyntaxError) && error.code !== 'ENOENT') throw error
      }
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    assert.fail('watcher did not reconcile capability metadata before timeout')
  }
  try {
    await engine.start()
    await until(async () => (await f.capabilityReport()).applied === true)
    assert.equal((await f.read()).connection.modelCapabilityRefs[MODEL], REF)
    await writeFile(f.providersFile, JSON.stringify({ groups: [{ id: 'glm-5.3-flash', members: ['kimi/k3'] }] }))
    await until(async () => (await f.read()).connection.modelCapabilityRefs[MODEL] === 'kimi-coding/k3')
    assert.equal((await f.read()).connection.defaultModel, MODEL)
  } finally { await engine.stop() }
})
