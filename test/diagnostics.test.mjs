import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm, stat, symlink } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { execFile } from 'node:child_process'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { FEATURES, buildDiagnostics, createDiagnostics, readDiagnostics, sanitizeDiagnostics, defaultStateDir } from '../diagnostics.mjs'
import { checkDaemon, formatDiagnostics, main } from '../diagnostics-cli.mjs'

const NOW = new Date('2026-11-06T06:00:00.000Z')
const configured = Object.fromEntries(FEATURES.map(feature => [feature, { status: 'configured', targets: ['agt-one'] }]))
const full = overrides => buildDiagnostics({ stages: configured, now: NOW, ...overrides })

test('the packaged diagnostics entry runs through an npm-style symlink', async t => {
  const root = await mkdtemp(join(tmpdir(), 'ducoro-diag-bin-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const entry = join(root, 'magpie-ducoro-status')
  await symlink(fileURLToPath(new URL('../diagnostics-cli.mjs', import.meta.url)), entry)
  const { stdout } = await promisify(execFile)(process.execPath, [entry, '--help'])
  assert.match(stdout, /Read-only saved sync report/)
})

async function temporary(t) {
  const root = await mkdtemp(join(tmpdir(), 'ducoro-diagnostics-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  return root
}

test('all six configured features remain explicitly unverified at runtime', () => {
  const report = full()
  assert.equal(report.status, 'configured')
  assert.equal(report.runtimeLoaded, 'unknown')
  assert.deepEqual(report.targets, ['agt-one'])
  for (const feature of FEATURES) assert.equal(report.features[feature].runtimeLoaded, 'unknown')
})

test('retries override configured stages and only affect their owning features', () => {
  const report = full({ retries: ['mcp-sync', 'skill-import', 'mcp-sync'] })
  assert.equal(report.status, 'pending')
  assert.equal(report.features.mcp.status, 'pending')
  assert.equal(report.features.skills.status, 'pending')
  assert.equal(report.features.connection.status, 'configured')
  assert.equal(report.features.mcp.issues.length, 1)
  assert.ok(report.features.skills.issues[0].nextAction)
})

test('unsupported and skipped stages never become configured; disabled stages stay disabled without revocation errors', () => {
  const report = full({ options: { syncMcp: false, syncAgentModels: false }, stages: { ...configured, subagents: { status: 'skipped' } }, retries: ['mcp-probe', 'bot-model-sync'] })
  assert.equal(report.features.mcp.status, 'disabled')
  assert.equal(report.features.models.status, 'disabled')
  assert.equal(report.features.subagents.status, 'skipped')
  assert.equal(report.status, 'unknown')
})

test('disabled resource cleanup failures remain pending until revocation succeeds', () => {
  const report = full({ options: { syncMcp: false, syncSkills: false, syncInstructions: false }, retries: ['mcp-sync', 'skill-cleanup', { code: 'instruction-pending', features: ['instructions'] }] })
  for (const feature of ['mcp', 'skills', 'instructions']) assert.equal(report.features[feature].status, 'pending')
  assert.equal(report.status, 'pending')
})

test('unselected optional resources are neutral while interrupted stages remain unknown', () => {
  const report = full({ total: { updatedAt: NOW.toISOString(), features: { instructions: { status: 'idle' }, subagents: { status: 'conditional' } }, errors: [], targets: [] } })
  assert.equal(report.status, 'configured')
  assert.equal(report.features.instructions.status, 'skipped')
  assert.equal(report.features.instructions.skipReason, 'not-selected')
  assert.match(formatDiagnostics({ ...report, stale: false }), /未选择资源/)
  assert.equal(sanitizeDiagnostics(report).status, 'configured')
  assert.equal(full({ stages: { ...configured, connection: { status: 'skipped', skipReason: 'superseded' } } }).status, 'unknown')
})

test('state counts and target IDs support scoped MCP and never expose source paths or secrets', () => {
  const secret = 'fixture-secret-for-test'
  const report = full({ reason: `http://secret.invalid/${secret}`, state: {
    connection: { key: secret, baseUrl: 'http://secret.invalid' },
    mcp: { 'global:one': { scope: 'global', sourceName: secret }, 'agt-two:one': { scope: 'agt-two', hash: secret } },
    skills: { one: { scope: 'agt-two', dir: '/private/secret', hash: secret } },
  } })
  assert.equal(report.features.mcp.count, 2)
  assert.deepEqual(report.features.mcp.targets, ['agt-one', 'agt-two'])
  assert.deepEqual(report.features.skills.targets, ['agt-one', 'agt-two'])
  assert.equal(report.reason, 'change')
  assert.doesNotMatch(JSON.stringify(report), /fixture-secret|secret\.invalid|\/private\/secret|"key"/)
})

test('only a current Total report contributes configuration results', () => {
  const total = { updatedAt: '2026-11-06T05:00:00Z', targets: ['agt-two'], features: { instructions: { status: 'configured' }, subagents: { status: 'pending' } }, errors: [{ resource: 'subagent:secret', message: 'Bearer secret' }] }
  const old = buildDiagnostics({ now: NOW, startedAt: NOW.toISOString(), total })
  assert.equal(old.features.instructions.status, 'unknown')
  assert.deepEqual(old.issues, [])
  total.updatedAt = NOW.toISOString()
  const current = buildDiagnostics({ now: NOW, startedAt: NOW.toISOString(), total })
  assert.equal(current.features.instructions.status, 'configured')
  assert.equal(current.features.subagents.status, 'pending')
  assert.deepEqual(current.features.subagents.targets, ['agt-two'])
  assert.doesNotMatch(JSON.stringify(current), /Bearer|subagent:secret/)
})

test('model migration and unapplied references are pending; review warnings retain configuration status', () => {
  const warning = full({ capabilities: { applied: true, entries: [{ status: 'mixed-models', warnings: ['secret raw warning'] }] } })
  assert.equal(warning.features.models.status, 'configured')
  assert.equal(warning.features.models.issues[0].code, 'mapping-review')
  assert.doesNotMatch(JSON.stringify(warning), /secret raw warning/)
  const pending = full({ state: { modelMigration: { target: 'secret' } }, capabilities: { applied: false, entries: [] } })
  assert.equal(pending.features.models.status, 'pending')
  assert.deepEqual(pending.features.models.issues.map(issue => issue.code), ['bot-model-sync', 'mapping-unapplied'])
})

test('collector writes atomically with private permissions and keeps stage-specific conflicts', async t => {
  const root = await temporary(t)
  const diagnostics = createDiagnostics({ stateDir: root, now: () => NOW })
  diagnostics.begin('manual')
  for (const feature of FEATURES) diagnostics.stage(feature, 'configured')
  diagnostics.stage('mcp', 'pending', { code: 'ownership-conflict', targets: ['agt-one'] })
  diagnostics.retry('options-invalid', ['skills'])
  const report = await diagnostics.write()
  assert.equal(report.features.mcp.status, 'pending')
  assert.equal(report.features.connection.status, 'configured')
  assert.equal(report.features.skills.status, 'pending')
  assert.deepEqual((await readdir(root)), ['sync-status.json'])
  assert.equal((await stat(join(root, 'sync-status.json'))).mode & 0o777, 0o600)
  assert.deepEqual(JSON.parse(await readFile(join(root, 'sync-status.json'), 'utf8')), report)
})

test('dry-run collector never creates state directory or writes a report', async t => {
  const root = await temporary(t)
  const missing = join(root, 'not-created')
  const diagnostics = createDiagnostics({ stateDir: missing, options: { dryRun: true }, now: () => NOW })
  diagnostics.begin('selftest')
  diagnostics.stage('connection', 'configured')
  const report = await diagnostics.write()
  assert.equal(report.features.connection.status, 'skipped')
  assert.equal(report.reason, 'preview')
  assert.deepEqual(await readdir(root), [])
})

test('read-only missing, malformed and oversized report reads do not create or mutate files', async t => {
  const root = await temporary(t)
  const missing = await readDiagnostics({ stateDir: root, now: NOW })
  assert.equal(missing.status, 'unknown')
  assert.equal(missing.stale, true)
  assert.equal(missing.updatedAt, null)
  assert.deepEqual(await readdir(root), [])
  for (const contents of ['{', 'x'.repeat(2 * 1024 * 1024 + 1)]) {
    await writeFile(join(root, 'sync-status.json'), contents)
    const report = await readDiagnostics({ stateDir: root, now: NOW })
    assert.equal(report.status, 'unknown')
    assert.equal(report.issues[0].code, 'report-invalid')
    assert.equal(await readFile(join(root, 'sync-status.json'), 'utf8'), contents)
  }
})

test('stale and future reports are explicitly marked without rewriting their timestamp', async t => {
  const root = await temporary(t)
  await writeFile(join(root, 'sync-status.json'), JSON.stringify(full()))
  const recent = await readDiagnostics({ stateDir: root, now: new Date(NOW.getTime() + 1000) })
  assert.equal(recent.stale, false)
  assert.equal(recent.ageMs, 1000)
  const stale = await readDiagnostics({ stateDir: root, now: new Date(NOW.getTime() + 301_000) })
  assert.equal(stale.stale, true)
  const future = await readDiagnostics({ stateDir: root, now: new Date(NOW.getTime() - 61_000) })
  assert.equal(future.stale, true)
  assert.equal(future.updatedAt, NOW.toISOString())
})

test('malicious imported fields, raw messages and non-array issue targets cannot escape or crash sanitizer', () => {
  for (const targets of [null, 'secret', {}, 123, ['https://secret.invalid', 'agt-good', '/private/secret']]) {
    const input = full()
    input.password = 'secret'
    input.runtimeLoaded = 'verified'
    input.features.connection.issues = [{ code: 'ownership-conflict', targets, message: 'secret', nextAction: 'https://secret.invalid' }]
    input.features.connection.runtimeLoaded = 'verified'
    input.features.skills = null
    const clean = sanitizeDiagnostics(input)
    assert.equal(clean.features.skills.status, 'unknown')
    assert.equal(clean.runtimeLoaded, 'unknown')
    assert.doesNotMatch(JSON.stringify(clean), /secret|verified/)
  }
  assert.equal(sanitizeDiagnostics(null), null)
  assert.equal(sanitizeDiagnostics({ schemaVersion: 1, features: {}, updatedAt: 'invalid' }), null)
})

test('default state directory follows documented environment variables', () => {
  assert.equal(defaultStateDir({ DUCORO_BRIDGE_STATE_DIR: ' /tmp/fixture ' }), '/tmp/fixture')
  assert.equal(defaultStateDir({ XDG_CONFIG_HOME: '/tmp/config' }), '/tmp/config/magpie/ducoro-bridge')
})

test('CLI supports help and errors without exposing supplied option data or touching state', async t => {
  const root = await temporary(t)
  let out = '', err = ''
  const io = { output: value => { out += value }, errorOutput: value => { err += value } }
  assert.equal(await main(['--help'], io), 0)
  assert.match(out, /Read-only/)
  assert.equal(await main(['--state-dir'], io), 2)
  assert.equal(await main(['--password=secret'], io), 2)
  assert.doesNotMatch(err, /secret/)
  out = ''
  assert.equal(await main(['--state-dir', root, '--json'], io), 2)
  assert.equal(JSON.parse(out).status, 'unknown')
  assert.deepEqual(await readdir(root), [])
})

test('doctor performs only info --json and never exports private daemon output', async t => {
  const root = await temporary(t)
  const cli = join(root, 'fixture-cli')
  const argsFile = join(root, 'args.json')
  await writeFile(cli, `#!${process.execPath}\nconst fs=require('node:fs'); fs.writeFileSync(${JSON.stringify(argsFile)},JSON.stringify(process.argv.slice(2))); console.log(JSON.stringify({serverVersion:'fixture',paths:{ducoroHome:'/private/secret'},token:'fixture-secret'}));\n`, { mode: 0o700 })
  const result = await checkDaemon({ cli })
  assert.equal(result.status, 'reachable')
  assert.deepEqual(JSON.parse(await readFile(argsFile, 'utf8')), ['info', '--json'])
  assert.doesNotMatch(JSON.stringify(result), /fixture-secret|\/private\/secret/)
  const missing = await checkDaemon({ cli: join(root, 'missing') })
  assert.equal(missing.status, 'unavailable')
})

test('doctor rejects invalid output and bounds an unresponsive executable', async t => {
  const root = await temporary(t)
  const cli = join(root, 'invalid-cli')
  await writeFile(cli, `#!${process.execPath}\nconsole.log('{}');\n`, { mode: 0o700 })
  assert.equal((await checkDaemon({ cli })).status, 'unavailable')
  await writeFile(cli, `#!${process.execPath}\nsetInterval(()=>{},1000);\n`, { mode: 0o700 })
  assert.equal((await checkDaemon({ cli, timeoutMs: 50 })).code, 'daemon-timeout')
})

test('plain text diagnostics show actionable failures and unknown session loading', () => {
  const text = formatDiagnostics({ ...full({ retries: ['mcp-probe'] }), stale: false })
  assert.match(text, /会话加载状态：未知/)
  assert.match(text, /\[mcp-probe\]/)
  assert.match(text, /下一步：/)
})
