import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { _internal } from '../bridge.mjs'
import { createDiagnostics, FEATURES } from '../diagnostics.mjs'

const KEY = 'fixture-diagnostics-secret'

async function fixture(t, flags = {}) {
  const root = await mkdtemp(join(tmpdir(), 'ducoro-diag-engine-'))
  const stateDir = join(root, 'state')
  await mkdir(stateDir)
  const paths = {
    DUCORO_BRIDGE_FILE: join(root, 'bridge.json'),
    DUCORO_BRIDGE_MCP_FILE: join(root, 'mcp.json'),
    DUCORO_BRIDGE_SKILLS_DIR: join(root, 'skills'),
    DUCORO_BRIDGE_STATE_DIR: stateDir,
    DUCORO_BRIDGE_LIBRARY_FILE: join(root, 'library.json'),
    DUCORO_BRIDGE_LIBRARY_SKILLS_DIR: join(root, 'library-skills'),
    DUCORO_BRIDGE_INSTRUCTIONS_FILE: join(root, 'instructions.md'),
    DUCORO_BRIDGE_DUCORO_HOME: root,
    DUCORO_BRIDGE_PROVIDERS_FILE: join(root, 'providers.json'),
    DUCORO_BRIDGE_PLUGIN_PROVIDERS_FILE: join(root, 'plugin-providers.json'),
  }
  const previous = Object.fromEntries(Object.keys(paths).map(name => [name, process.env[name]]))
  Object.assign(process.env, paths)
  t.after(async () => {
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
    await rm(root, { recursive: true, force: true })
  })
  const db = join(root, 'fake.json')
  const data = { calls: [], servers: {}, bots: [{ id: 'agt-one', modelPreference: { runtime: 'pi-agent', connectionSlug: 'magpie-ducoro' } }], ...flags }
  await writeFile(db, JSON.stringify(data))
  await writeFile(paths.DUCORO_BRIDGE_FILE, '{}')
  await writeFile(paths.DUCORO_BRIDGE_LIBRARY_FILE, JSON.stringify({ mcp: [{ name: 'demo', transport: 'http', url: 'https://private.invalid/mcp', agents: ['ducoro'] }], skills: [] }))
  await writeFile(paths.DUCORO_BRIDGE_MCP_FILE, JSON.stringify({ mcpServers: { demo: { type: 'http', url: 'https://private.invalid/mcp', headers: { Authorization: `Bearer ${KEY}` } } } }))
  const cli = join(root, 'fake-ducoro')
  await writeFile(cli, `#!${process.execPath}
const fs=require('node:fs');
const file=${JSON.stringify(db)};
const data=JSON.parse(fs.readFileSync(file,'utf8'));
const args=process.argv.slice(2).filter(x=>x!=='--json');
const flag=name=>args[args.indexOf(name)+1];
data.calls.push(args); let out=null, code=0;
const fail=()=>{code=1;out={error:{message:${JSON.stringify(`private error ${KEY} https://private.invalid /private/source`)}}};};
if(args[0]==='agent'&&args[1]==='list')out={agents:data.bots};
else if(args[0]==='mcp'||args[0]==='agent'&&args[1]==='mcp'){
 const scoped=args[0]==='agent', action=args[scoped?2:1], scope=scoped?args[3]:'global';
 const slug=args[scoped?4:2];
 if(action==='list')out={servers:Object.entries(data.servers).filter(([k])=>k.startsWith(scope+':')).map(([k,s])=>s)};
 else if(action==='add'||action==='update'){
  if(data.failSave)fail(); else{const key=scope+':'+(action==='add'?flag('--slug'):slug);data.servers[key]={slug:action==='add'?flag('--slug'):slug,connectionStatus:'disconnected'};out={};}
 }else if(action==='rm'){if(data.failRemove)fail();else{delete data.servers[scope+':'+slug];out={};}}
 else if(action==='probe'){if(data.failProbe)fail();else{data.servers[scope+':'+slug].connectionStatus='connected';out={tools:[{name:'demo_tool'}]};}}
 else fail();
}else if(args[0]==='skill')out=[];
else fail();
fs.writeFileSync(file,JSON.stringify(data));process.stdout.write(JSON.stringify(out));process.exitCode=code;
`, { mode: 0o700 })
  const create = options => {
    const engine = _internal.createEngine({ directory: root }, {
      cli, syncConnection: false, syncAgentModels: false, syncSkills: false,
      syncInstructions: false, syncSubagents: false, ...options,
    })
    t.after(() => engine.stop())
    return engine
  }
  return {
    root, stateDir, paths, create,
    report: async () => JSON.parse(await readFile(join(stateDir, 'sync-status.json'), 'utf8')),
    read: async () => JSON.parse(await readFile(db, 'utf8')),
    write: async data => writeFile(db, JSON.stringify(data)),
  }
}

test('real engine writes configured MCP state and a unified report after a successful manual sync', async t => {
  const f = await fixture(t)
  assert.equal(await f.create().syncAll('manual'), true)
  const report = await f.report()
  assert.equal(report.features.mcp.status, 'configured')
  assert.equal(report.features.mcp.count, 1)
  assert.equal(report.features.mcp.probeStatus, 'passed')
  assert.equal(report.runtimeLoaded, 'unknown')
  assert.equal(report.features.connection.status, 'disabled')
  assert.doesNotMatch(JSON.stringify(report), /fixture-diagnostics-secret|private\.invalid|\/private\/source/)
  assert.ok((await f.read()).calls.some(args => args[1] === 'probe'))
})

test('manual probe failure remains visible after the engine returns, without exposing raw errors', async t => {
  const f = await fixture(t, { failProbe: true })
  await f.create().syncAll('manual')
  const report = await f.report()
  assert.equal(report.features.mcp.status, 'pending')
  assert.equal(report.features.mcp.probeStatus, 'failed')
  assert.ok(report.features.mcp.issues.some(issue => issue.code === 'mcp-probe'))
  assert.doesNotMatch(JSON.stringify(report), /fixture-diagnostics-secret|private\.invalid|\/private\/source/)
})

test('failed MCP writes are pending and never followed by a probe', async t => {
  const f = await fixture(t, { failSave: true })
  await f.create().syncAll('manual')
  const report = await f.report()
  assert.equal(report.features.mcp.status, 'pending')
  assert.ok(report.features.mcp.issues.some(issue => issue.code === 'mcp-sync'))
  assert.equal((await f.read()).calls.some(args => args[1] === 'probe'), false)
})

test('CLI errors cannot expose a bare bearer token in bridge logs', async t => {
  const f = await fixture(t, { failSave: true })
  const messages = []
  const originalLog = console.log
  try {
    console.log = (...args) => messages.push(args.join(' '))
    await f.create().syncAll('manual')
  } finally { console.log = originalLog }
  assert.ok(messages.some(message => message.includes('failed')))
  assert.ok(!messages.join('\n').includes(KEY))
})

test('unavailable named selections are diagnosed without broadening access', async t => {
  const f = await fixture(t)
  await f.create({ mcpScope: 'agents', resourceAssignments: { 'agt-one': { mcp: ['missing-server'] } } }).syncAll('manual')
  const report = await f.report()
  assert.equal(report.features.mcp.status, 'pending')
  assert.ok(report.features.mcp.issues.some(issue => issue.code === 'resource-selection-unavailable'))
  assert.deepEqual(report.features.mcp.issues.find(issue => issue.code === 'resource-selection-unavailable').targets, ['agt-one'])
  assert.deepEqual((await f.read()).servers, {})
})

test('failed revocation stays visible after MCP sync is switched off', async t => {
  const f = await fixture(t)
  await f.create().syncAll('manual')
  const data = await f.read()
  data.failRemove = true
  await f.write(data)
  await f.create({ syncMcp: false }).syncAll('manual')
  const report = await f.report()
  assert.equal(report.features.mcp.status, 'pending')
  assert.equal(report.features.mcp.count, 1)
  assert.ok(report.features.mcp.issues.some(issue => issue.code === 'mcp-sync'))
  assert.ok((await f.read()).servers['global:magpie-demo'])
})

test('scope targets are represented in a real engine report', async t => {
  const f = await fixture(t)
  await f.create({ mcpScope: 'agents' }).syncAll('manual')
  const report = await f.report()
  assert.deepEqual(report.features.mcp.targets, ['agt-one'])
  assert.deepEqual(report.targets, ['agt-one'])
  assert.equal(report.features.mcp.status, 'configured')
  assert.ok((await f.read()).servers['agt-one:magpie-demo'])
})

test('invalid selections only produce diagnostics and do not change owned state or invoke Ducoro', async t => {
  const f = await fixture(t)
  const owned = JSON.stringify({ v: 2, connection: null, mcp: {}, skills: {}, extra: 'fixture-preserve' })
  await writeFile(join(f.stateDir, 'state.json'), owned)
  await f.create({ resourceAssignments: { 'agt-one': { mcp: 'all' } } }).syncAll('manual')
  const report = await f.report()
  assert.equal(report.status, 'pending')
  assert.ok(report.issues.some(issue => issue.code === 'options-invalid'))
  assert.deepEqual((await f.read()).calls, [])
  assert.equal(await readFile(join(f.stateDir, 'state.json'), 'utf8'), owned)
  assert.deepEqual((await readdir(f.stateDir)).sort(), ['state.json', 'sync-status.json'])
})

test('an unreadable library is pending without carrying over a previous Total report', async t => {
  const f = await fixture(t)
  await writeFile(f.paths.DUCORO_BRIDGE_LIBRARY_FILE, '{')
  await writeFile(join(f.stateDir, 'total-status.json'), JSON.stringify({ updatedAt: new Date().toISOString(), targets: ['agt-old'], features: { instructions: { status: 'configured' }, subagents: { status: 'configured' } }, errors: [] }))
  await f.create({ syncInstructions: true, syncSubagents: true }).syncAll('manual')
  const report = await f.report()
  assert.equal(report.features.instructions.status, 'pending')
  assert.equal(report.features.subagents.status, 'pending')
  assert.deepEqual(report.targets, [])
  assert.ok(report.issues.some(issue => issue.code === 'library-unreadable'))
})

test('probe result fencing preserves a newer host report and treats multiple probe results conservatively', async t => {
  const f = await fixture(t)
  const now = () => new Date('2026-11-06T06:00:00Z')
  const first = createDiagnostics({ stateDir: f.stateDir, now })
  first.begin('manual')
  for (const feature of FEATURES) first.stage(feature, 'configured')
  const token = first.token()
  await first.write()
  assert.equal(await first.probeResult(token, false), true)
  assert.equal((await f.report()).features.mcp.probeStatus, 'failed')
  assert.equal(await first.probeResult(token, true), true)
  assert.equal((await f.report()).features.mcp.probeStatus, 'failed')
  const second = createDiagnostics({ stateDir: f.stateDir, now })
  second.begin('interval')
  for (const feature of FEATURES) second.stage(feature, 'configured')
  await second.write()
  const newer = await readFile(join(f.stateDir, 'sync-status.json'), 'utf8')
  assert.equal(await first.probeResult(token, false), false)
  assert.equal(await readFile(join(f.stateDir, 'sync-status.json'), 'utf8'), newer)
  assert.equal(await second.probeResult(second.token(), true), true)
  assert.equal((await f.report()).features.mcp.probeStatus, 'passed')
})

test('a busy mutation lock prevents probe report writes and is left intact', async t => {
  const f = await fixture(t)
  const diagnostics = createDiagnostics({ stateDir: f.stateDir })
  diagnostics.begin('manual')
  diagnostics.stage('mcp', 'configured')
  await diagnostics.write()
  const before = await readFile(join(f.stateDir, 'sync-status.json'), 'utf8')
  await mkdir(join(f.stateDir, 'sync.lock'))
  await writeFile(join(f.stateDir, 'sync.lock', 'owner.json'), JSON.stringify({ pid: process.pid }))
  assert.equal(await diagnostics.probeResult(diagnostics.token(), false), false)
  assert.equal(await readFile(join(f.stateDir, 'sync-status.json'), 'utf8'), before)
  assert.ok((await readdir(f.stateDir)).includes('sync.lock'))
  await rm(join(f.stateDir, 'sync.lock'), { recursive: true })
})
