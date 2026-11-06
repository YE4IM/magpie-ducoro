import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _internal } from '../bridge.mjs'
import { planResourceScopes, scopedLibrary, mcpCommand, findUnavailableAssignments } from '../resource-scopes.mjs'

const bot = (id, connectionSlug = 'magpie-ducoro', runtime = 'pi-agent') => ({ id, modelPreference: { connectionSlug, runtime } })
const scoped = { mcpScope: 'agents', skillsScope: 'agents' }

async function fixture(t, overrides = {}) {
  const root = await mkdtemp(join(tmpdir(), 'ducoro-032-resources-'))
  const stateDir = join(root, 'state')
  const libraryFile = join(root, 'library.json')
  const database = join(root, 'database.json')
  await mkdir(stateDir)
  const env = {
    DUCORO_BRIDGE_FILE: join(root, 'bridge.json'), DUCORO_BRIDGE_MCP_FILE: join(root, 'mcp.json'),
    DUCORO_BRIDGE_SKILLS_DIR: join(root, 'skills'), DUCORO_BRIDGE_STATE_DIR: stateDir,
    DUCORO_BRIDGE_LIBRARY_FILE: libraryFile, DUCORO_BRIDGE_LIBRARY_SKILLS_DIR: join(root, 'library-skills'),
    DUCORO_BRIDGE_INSTRUCTIONS_FILE: join(root, 'instructions.md'), DUCORO_BRIDGE_DUCORO_HOME: root,
    DUCORO_BRIDGE_PROVIDERS_FILE: join(root, 'providers.json'), DUCORO_BRIDGE_PLUGIN_PROVIDERS_FILE: join(root, 'plugin-providers.json'),
  }
  const saved = Object.fromEntries(Object.keys(env).map(key => [key, process.env[key]]))
  Object.assign(process.env, env)
  const engines = []
  t.after(async () => {
    await Promise.all(engines.map(engine => engine.stop()))
    for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete process.env[key]; else process.env[key] = value }
    await rm(root, { recursive: true, force: true })
  })
  await writeFile(env.DUCORO_BRIDGE_FILE, '{}')
  await writeFile(env.DUCORO_BRIDGE_MCP_FILE, JSON.stringify({ mcpServers: {
    repo: { type: 'http', url: 'http://fixture.invalid/repo', headers: { Authorization: 'fixture,secret' } },
    writer: { command: 'fixture-executable', args: ['--mode', 'write'] },
  } }))
  const library = { mcp: [
    { name: 'repo', agents: ['ducoro'], transport: 'http', disabledTools: ['delete'] },
    { name: 'writer', agents: ['ducoro'], transport: 'stdio' },
    { name: 'unassigned', agents: ['claude'], transport: 'http', url: 'http://fixture.invalid/forbidden' },
    { name: 'disabled', agents: ['ducoro'], disabled: true, transport: 'http', url: 'http://fixture.invalid/disabled' },
  ], skills: [
    { name: 'review', agents: ['ducoro'] }, { name: 'draft', agents: ['ducoro'] }, { name: 'unassigned', agents: ['claude'] },
  ] }
  await writeFile(libraryFile, JSON.stringify(library))
  for (const name of ['review', 'draft']) {
    await mkdir(join(env.DUCORO_BRIDGE_SKILLS_DIR, name), { recursive: true })
    await writeFile(join(env.DUCORO_BRIDGE_SKILLS_DIR, name, 'SKILL.md'), `---\nname: ${name}\ndescription: Fixture role\n---\nPerform ${name}.\n`)
  }
  await writeFile(database, JSON.stringify({
    bots: [bot('agt-one'), bot('agt-two'), bot('agt-other', 'foreign'), bot('agt-native', 'magpie-ducoro', 'claude-code')],
    mcp: {}, skills: {}, calls: [], ...overrides,
  }))
  const cli = join(root, 'fake-cli')
  await writeFile(cli, `#!${process.execPath}
const fs = require('node:fs'), path = require('node:path');
const file = ${JSON.stringify(database)};
const data = JSON.parse(fs.readFileSync(file, 'utf8'));
const args = process.argv.slice(2).filter(arg => arg !== '--json');
data.calls.push(args);
let out = null, code = 0;
const fail = message => { code = 1; out = { error: { code: 'HANDLER_ERROR', message } }; };
if (args[0] === 'agent' && args[1] === 'list') {
  if (data.failAgentList) fail('temporarily unavailable'); else out = { agents: data.bots };
} else if (args[0] === 'credentials') out = { saved: true };
else {
  const agent = args[0] === 'agent';
  const kind = agent ? args[1] : args[0], action = agent ? args[2] : args[1];
  const scope = agent ? args[3] : 'global', tail = args.slice(agent ? 4 : 2);
  const flag = name => tail[tail.indexOf(name) + 1];
  if (!['mcp', 'skill'].includes(kind)) fail('unexpected command');
  else if (data.failList === scope && action === 'list') fail('layer read failed');
  else {
    data[kind === 'skill' ? 'skills' : 'mcp'][scope] ??= {};
    const layer = data[kind === 'skill' ? 'skills' : 'mcp'][scope];
    if (action === 'list') out = kind === 'mcp' ? { servers: Object.values(layer) } : { skills: Object.values(layer) };
    else if (['rm', 'remove'].includes(action)) {
      if (data.failRemove === scope || data.failRemove === kind + ':' + scope) fail('removal deferred');
      else { delete layer[tail[0]]; out = { deleted: true }; }
    } else if (kind === 'mcp' && ['add', 'update'].includes(action)) {
      const slug = action === 'add' ? flag('--slug') : tail[0];
      if (data.failMcp === scope) fail('save failed');
      else { layer[slug] = { slug, name: flag('--name'), transport: flag('--transport'), connectionStatus: 'connected', toolDeny: flag('--tool-deny') }; out = { server: layer[slug] }; }
    } else if (kind === 'mcp' && action === 'probe') out = { tools: [{ name: 'read' }] };
    else if (kind === 'skill' && action === 'import') {
      if (data.failImport === scope) fail('import failed');
      else { const md = fs.readFileSync(path.join(tail[0], 'SKILL.md'), 'utf8'); const name = /^name: (.+)$/m.exec(md)[1]; layer[name] = { name, md }; out = { name }; }
    } else if (kind === 'skill' && action === 'rename') { const item = layer[tail[0]]; delete layer[tail[0]]; layer[flag('--to')] = { ...item, name: flag('--to') }; out = { renamed: true }; }
    else fail('unexpected resource command');
  }
}
fs.writeFileSync(file, JSON.stringify(data)); process.stdout.write(JSON.stringify(out)); process.exitCode = code;
`, { mode: 0o700 })
  const create = (options = {}) => {
    const engine = _internal.createEngine({ directory: root }, { cli, syncConnection: false, syncAgentModels: false, syncInstructions: false, syncSubagents: false, ...options })
    engines.push(engine)
    return engine
  }
  return {
    root, stateDir, library, libraryFile, env, create,
    read: async () => JSON.parse(await readFile(database, 'utf8')),
    write: value => writeFile(database, JSON.stringify(value)),
    state: async () => JSON.parse(await readFile(join(stateDir, 'state.json'), 'utf8')),
    writeState: value => writeFile(join(stateDir, 'state.json'), JSON.stringify(value)),
  }
}

const mutations = data => data.calls.filter(args => args[0] === 'agent' ? ['add', 'update', 'rm', 'import', 'remove', 'rename'].includes(args[2]) : ['add', 'update', 'rm', 'import', 'remove', 'rename'].includes(args[1]))

test('scope planner filters connection and runtime; explicit empty and omitted fields have distinct meaning', () => {
  const opts = { ...scoped, syncMcp: true, syncSkills: true, connectionSlug: 'magpie-ducoro', resourceAssignments: { 'agt-one': { mcp: [] } } }
  assert.deepEqual(planResourceScopes(opts, [bot('agt-one'), bot('agt-two'), bot('agt-other', 'other'), bot('agt-native', 'magpie-ducoro', 'claude-code')]), {
    targets: ['agt-one', 'agt-two'], mcpScopes: ['agt-one', 'agt-two'], skillScopes: ['agt-one', 'agt-two'],
  })
  const library = { mcp: [{ name: 'repo' }], skills: [{ name: 'review' }] }
  assert.deepEqual(scopedLibrary(library, opts, 'mcp', 'agt-one').mcp, [])
  assert.equal(scopedLibrary(library, opts, 'mcp', 'agt-two'), library)
  assert.throws(() => planResourceScopes({ ...opts, targetAgents: ['agt-missing'] }, [bot('agt-one')]), /missing/)
  assert.throws(() => planResourceScopes({ ...opts, resourceAssignments: { 'agt-one': { mcp: null } } }), /arrays/)
  assert.deepEqual(mcpCommand('agt-one', 'update', 'repo'), ['agent', 'mcp', 'update', 'agt-one', 'repo'])
})

test('unavailable named selections identify only affected resource stages and Bots without leaking supplied names', () => {
  const opts = { ...scoped, resourceAssignments: {
    'agt-one': { mcp: ['repo', 'private-fixture-name'], skills: ['review'] },
    'agt-two': { mcp: ['disabled', 'other-agent', 'off-here', 'not-enabled'], skills: ['missing-skill'] },
  } }
  const library = { mcp: [
    { name: 'repo', agents: ['ducoro'] }, { name: 'disabled', agents: ['ducoro'], disabled: true },
    { name: 'other-agent', agents: ['claude'] }, { name: 'off-here', agents: ['ducoro'], offHere: true },
    { name: 'not-enabled', agents: ['ducoro'], enabled: false },
  ], skills: [{ name: 'review', agents: ['ducoro'] }] }
  const issues = findUnavailableAssignments(library, opts, { mcpScopes: ['agt-one', 'agt-two'], skillScopes: ['agt-one', 'agt-two'] })
  assert.deepEqual(issues, [
    { scope: 'agt-one', kind: 'mcp' }, { scope: 'agt-two', kind: 'mcp' }, { scope: 'agt-two', kind: 'skills' },
  ])
  assert.ok(!JSON.stringify(issues).includes('private-fixture-name'))
})

test('unavailable selection checks ignore inherited/empty choices and inactive scopes', () => {
  const opts = { ...scoped, resourceAssignments: {
    'agt-one': { mcp: [], skills: [] }, 'agt-two': {}, 'agt-inactive': { mcp: ['missing'] },
  } }
  assert.deepEqual(findUnavailableAssignments({ mcp: [], skills: [] }, opts, {
    mcpScopes: ['agt-one', 'agt-two'], skillScopes: ['agt-one', 'agt-two'],
  }), [])
  assert.deepEqual(findUnavailableAssignments({ mcp: [], skills: [] }, {
    ...opts, mcpScope: 'global', skillsScope: 'global',
  }, { mcpScopes: ['global'], skillScopes: ['global'] }), [])
})

test('two Bots receive separate MCP and skill selections; unassigned/disabled resources never appear', async t => {
  const f = await fixture(t)
  const engine = f.create({ ...scoped, resourceAssignments: {
    'agt-one': { mcp: ['repo', 'unassigned', 'disabled'], skills: ['review', 'unassigned'] },
    'agt-two': { mcp: ['writer'], skills: ['draft'] },
  } })
  await engine.syncAll('scoped')
  const data = await f.read()
  assert.deepEqual(Object.keys(data.mcp['agt-one']), ['magpie-repo'])
  assert.deepEqual(Object.keys(data.mcp['agt-two']), ['magpie-writer'])
  assert.equal(data.mcp['agt-one']['magpie-repo'].toolDeny, 'delete')
  assert.deepEqual(Object.keys(data.skills['agt-one']), ['review'])
  assert.deepEqual(Object.keys(data.skills['agt-two']), ['draft'])
  assert.equal(data.mcp.global, undefined)
  assert.equal(data.skills.global, undefined)
  assert.equal(data.mcp['agt-other'], undefined)
  assert.deepEqual(engine.currentResourceTargets, ['agt-one', 'agt-two'])
  const saved = await f.state()
  assert.equal(saved.mcp['agt-one:magpie-repo'].scope, 'agt-one')
  assert.equal(saved.mcp['agt-two:magpie-writer'].slug, 'magpie-writer')
})

test('omitted selections inherit Magpie assignments, empty arrays revoke resources and survive restart', async t => {
  const f = await fixture(t)
  await f.create({ ...scoped, targetAgents: ['agt-one'] }).syncAll('inherit')
  let data = await f.read()
  assert.deepEqual(Object.keys(data.mcp['agt-one']).sort(), ['magpie-repo', 'magpie-writer'])
  assert.deepEqual(Object.keys(data.skills['agt-one']).sort(), ['draft', 'review'])
  data.calls = []
  await f.write(data)
  const engine = f.create({ ...scoped, targetAgents: ['agt-one'], prune: false, resourceAssignments: { 'agt-one': { mcp: [], skills: [] } } })
  await engine.syncAll('revoke')
  data = await f.read()
  assert.deepEqual(data.mcp['agt-one'], {})
  assert.deepEqual(data.skills['agt-one'], {})
  assert.deepEqual((await f.state()).mcp, {})
  assert.deepEqual((await f.state()).skills, {})
  assert.ok(mutations(data).every(args => args[0] === 'agent' && args[3] === 'agt-one'))
})

test('global to scoped migration retires only owned definitions before installing new ones', async t => {
  const f = await fixture(t)
  await f.create().syncAll('global')
  const state = await f.state()
  // Simulate the exact 0.3.1 ownership layout.
  state.mcp = Object.fromEntries(Object.values(state.mcp).map(mine => [mine.slug, mine.hash]))
  await f.writeState(state)
  const data = await f.read()
  data.mcp.global.foreign = { slug: 'foreign', connectionStatus: 'connected' }
  data.skills.global.foreign = { name: 'foreign' }
  data.calls = []
  await f.write(data)
  await f.create({ ...scoped, targetAgents: ['agt-one'] }).syncAll('upgrade')
  const next = await f.read()
  assert.deepEqual(Object.keys(next.mcp.global), ['foreign'])
  assert.deepEqual(Object.keys(next.skills.global), ['foreign'])
  assert.deepEqual(Object.keys(next.mcp['agt-one']).sort(), ['magpie-repo', 'magpie-writer'])
  assert.deepEqual(Object.keys(next.skills['agt-one']).sort(), ['draft', 'review'])
  const calls = mutations(next)
  const firstMcpAdd = calls.findIndex(args => args[0] === 'agent' && args[1] === 'mcp' && args[2] === 'add')
  assert.ok(calls.findLastIndex(args => args[0] === 'mcp' && args[1] === 'rm') < firstMcpAdd)
  assert.ok(Object.keys((await f.state()).mcp).every(id => id.startsWith('agt-one:')))
})

test('failed removal blocks additions in that resource family and retries on restart', async t => {
  const f = await fixture(t)
  await f.create().syncAll('global')
  let data = await f.read()
  data.failRemove = 'global'
  data.calls = []
  await f.write(data)
  await f.create({ ...scoped, targetAgents: ['agt-one'] }).syncAll('failed-migration')
  data = await f.read()
  assert.equal(mutations(data).filter(args => args[0] === 'agent').length, 0)
  assert.equal(Object.keys((await f.state()).mcp).length, 2)
  assert.equal(Object.keys((await f.state()).skills).length, 2)
  data.failRemove = null
  data.calls = []
  await f.write(data)
  await f.create({ ...scoped, targetAgents: ['agt-one'] }).syncAll('retry')
  assert.deepEqual(Object.keys((await f.read()).skills['agt-one']).sort(), ['draft', 'review'])
})

test('target-list failure and missing explicit targets retain all existing resources', async t => {
  const f = await fixture(t)
  await f.create({ ...scoped, targetAgents: ['agt-one'] }).syncAll('initial')
  let data = await f.read()
  data.failAgentList = true
  data.calls = []
  await f.write(data)
  await f.create({ ...scoped, targetAgents: ['agt-one'], resourceAssignments: { 'agt-one': { mcp: [], skills: [] } } }).syncAll('failed-list')
  assert.equal(mutations(await f.read()).length, 0)
  data = await f.read()
  data.failAgentList = false
  data.calls = []
  await f.write(data)
  await f.create({ ...scoped, targetAgents: ['agt-missing'] }).syncAll('missing-target')
  assert.equal(mutations(await f.read()).length, 0)
  assert.equal(Object.keys((await f.state()).mcp).length, 2)
})

test('foreign same-name entries in a Bot layer are neither adopted nor overwritten', async t => {
  const f = await fixture(t, { mcp: { 'agt-one': { 'magpie-repo': { slug: 'magpie-repo', name: 'operator owned', connectionStatus: 'connected' } } }, skills: { 'agt-one': { review: { name: 'review', md: 'operator owned' } } } })
  const engine = f.create({ ...scoped, targetAgents: ['agt-one'], resourceAssignments: { 'agt-one': { mcp: ['repo'], skills: ['review'] } } })
  await engine.syncAll('collision')
  const data = await f.read()
  assert.equal(mutations(data).length, 0)
  assert.equal(data.mcp['agt-one']['magpie-repo'].name, 'operator owned')
  assert.equal(data.skills['agt-one'].review.md, 'operator owned')
  assert.deepEqual(engine.state.mcp, {})
  assert.deepEqual(engine.state.skills, {})
})

test('shared credential materialization remains idempotent across scopes and restarts', async t => {
  const f = await fixture(t)
  const opts = { ...scoped, resourceAssignments: { 'agt-one': { mcp: ['repo'], skills: [] }, 'agt-two': { mcp: ['repo'], skills: [] } } }
  await f.create(opts).syncAll('initial')
  let data = await f.read()
  assert.equal(data.calls.filter(args => args[0] === 'credentials').length, 2)
  data.calls = []
  await f.write(data)
  await f.create(opts).syncAll('repeat')
  data = await f.read()
  assert.equal(data.calls.filter(args => args[0] === 'credentials').length, 0)
  assert.equal(mutations(data).length, 0)
})

test('failed scoped skill replacement restores the earlier bundle and retries without touching other Bots', async t => {
  const f = await fixture(t)
  const opts = { ...scoped, targetAgents: ['agt-one'], resourceAssignments: { 'agt-one': { mcp: [], skills: ['review'] } } }
  await f.create(opts).syncAll('initial')
  const original = (await f.read()).skills['agt-one'].review.md
  await writeFile(join(f.env.DUCORO_BRIDGE_SKILLS_DIR, 'review', 'SKILL.md'), '---\nname: review\ndescription: Updated fixture\n---\nUpdated review.\n')
  let data = await f.read()
  data.failImport = 'agt-one'
  data.calls = []
  await f.write(data)
  await f.create(opts).syncAll('failed-update')
  data = await f.read()
  assert.equal(data.skills['agt-one'].review.md, original)
  assert.deepEqual(Object.keys(data.skills['agt-one']), ['review'])
  assert.ok(mutations(data).every(args => args[0] === 'agent' && args[3] === 'agt-one'))
  data.failImport = null
  data.calls = []
  await f.write(data)
  await f.create(opts).syncAll('retry')
  assert.match((await f.read()).skills['agt-one'].review.md, /Updated review/)
})

test('library deselection revokes each Bot copy while an unreadable library retains all copies', async t => {
  const f = await fixture(t)
  await f.create(scoped).syncAll('initial')
  await writeFile(f.libraryFile, '{')
  let data = await f.read()
  data.calls = []
  await f.write(data)
  await f.create(scoped).syncAll('broken-library')
  assert.equal(mutations(await f.read()).length, 0)
  f.library.mcp = f.library.mcp.filter(item => item.name !== 'repo')
  f.library.skills = f.library.skills.filter(item => item.name !== 'review')
  await writeFile(f.libraryFile, JSON.stringify(f.library))
  await f.create(scoped).syncAll('deselection')
  data = await f.read()
  for (const id of ['agt-one', 'agt-two']) {
    assert.deepEqual(Object.keys(data.mcp[id]), ['magpie-writer'])
    assert.deepEqual(Object.keys(data.skills[id]), ['draft'])
  }
})

test('unreadable Bot layer postpones its mutations without deleting ownership or changing other scopes', async t => {
  const f = await fixture(t)
  const opts = { ...scoped, targetAgents: ['agt-one'], resourceAssignments: { 'agt-one': { mcp: ['repo'], skills: ['review'] } } }
  await f.create(opts).syncAll('initial')
  const original = await f.state()
  const data = await f.read()
  data.failList = 'agt-one'
  data.calls = []
  await f.write(data)
  await f.create(opts).syncAll('unreadable-layer')
  assert.equal(mutations(await f.read()).length, 0)
  assert.deepEqual((await f.state()).mcp, original.mcp)
  assert.deepEqual((await f.state()).skills, original.skills)
})

test('an unreadable MCP export retains existing owned definitions rather than treating it as revocation', async t => {
  const f = await fixture(t)
  const opts = { ...scoped, targetAgents: ['agt-one'], resourceAssignments: { 'agt-one': { mcp: ['repo'], skills: [] } } }
  await f.create(opts).syncAll('initial')
  const original = await f.state()
  await writeFile(f.env.DUCORO_BRIDGE_MCP_FILE, '{')
  const data = await f.read()
  data.calls = []
  await f.write(data)
  await f.create(opts).syncAll('export-unreadable')
  assert.equal(mutations(await f.read()).length, 0)
  assert.deepEqual((await f.state()).mcp, original.mcp)
})

test('moving the explicit resource target cleans the old Bot layer and never mutates unrelated Bots', async t => {
  const f = await fixture(t)
  const selections = { 'agt-one': { mcp: ['repo'], skills: ['review'] }, 'agt-two': { mcp: ['writer'], skills: ['draft'] } }
  await f.create({ ...scoped, targetAgents: ['agt-one'], resourceAssignments: selections }).syncAll('initial')
  const data = await f.read()
  data.calls = []
  await f.write(data)
  await f.create({ ...scoped, targetAgents: ['agt-two'], resourceAssignments: selections }).syncAll('move-target')
  const result = await f.read()
  assert.deepEqual(result.mcp['agt-one'], {})
  assert.deepEqual(result.skills['agt-one'], {})
  assert.deepEqual(Object.keys(result.mcp['agt-two']), ['magpie-writer'])
  assert.deepEqual(Object.keys(result.skills['agt-two']), ['draft'])
  assert.ok(mutations(result).every(args => args[0] === 'agent' && ['agt-one', 'agt-two'].includes(args[3])))
})
