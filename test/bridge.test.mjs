import test from 'node:test';
import assert from 'node:assert/strict';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { _internal } from '../bridge.mjs';
import { DEFAULTS } from '../lib/defaults.mjs';
import { buildSyncPreview } from '../lib/sync-preview.mjs';
import { verifyConfiguration } from '../lib/verification.mjs';
import { inspectBots } from '../lib/bot-inspection.mjs';
import { readManagedState, createStateBackup, restoreStateBackup } from '../lib/state-store.mjs';
import { buildDiagnostics, sanitizeDiagnostics } from '../lib/diagnostics.mjs';
import { pluginVersion } from '../lib/version.mjs';
import { resolve, source } from '../lib/plan-rules.mjs';
import { createTotalSync, instructionBlock, instructionsMatch, mergeInstructions } from '../lib/total.mjs';
import { contentChanges } from '../lib/content-preview.mjs';
import { desiredResources, mcpSlug } from '../lib/resource-plan.mjs';
import { skillFingerprint, skillVerificationFingerprints } from '../lib/skill-bundle.mjs';
import { validateOptions } from '../lib/options.mjs';
import { createCheckpoint, rollbackDraft } from '../lib/control-center.mjs';
import '../ui/plans.js';
import '../ui/task-center.js';

const exec = promisify(execFile);
const { createEngine } = _internal;
const botIds = ['agt-alpha', 'agt-beta'];
const capabilities = { botModelWrite: 'available' };
const url = 'http://127.0.0.1:19999';
const connector = { name: 'glossary', transport: 'http', url, agents: ['ducoro'] };
const fixtureOptions = {
  ...DEFAULTS, syncAgentModels: false, syncSkills: false,
  syncInstructions: false, syncSubagents: false, syncConnection: false,
};

function fakeCli() {
  const directory = process.env.TEST_DUCORO_FIXTURE;
  const file = directory + '/cli-state.json';
  const state = JSON.parse(readFileSync(file, 'utf8'));
  const args = process.argv.slice(2, -1);
  appendFileSync(directory + '/cli-commands.jsonl', JSON.stringify(args) + '\n');
  const option = name => args[args.indexOf(name) + 1];
  const respond = value => process.stdout.write(JSON.stringify(value));
  const save = () => writeFileSync(file, JSON.stringify(state));
  if (args.includes('--help')) return respond({});
  if (args[0] === 'connections') {
    if (args[1] === 'get') return respond(state.route);
    if (args[1] === 'list') return respond(state.route ? [state.route] : []);
    if (args[1] === 'catalog') return respond([]);
    if (args[1] === 'add-apikey') {
      if (args.includes('--capability-refs')) throw Error('Unexpected empty capability references on creation');
      if (readFileSync(0, 'utf8').trim() !== 'test-secret') throw Error('Missing stdin');
      state.route = { slug: option('--slug'), baseUrl: option('--base-url'), defaultModel: option('--model'), models: option('--models').split(',') };
      save();
      return respond(state.route);
    }
  }
  if (args.join(' ') === 'agent list') return respond(state.bots);
  if (args[0] === 'info') return respond({});
  if (args[0] === 'mcp' && args[1] === 'catalog') return respond([]);
  const scoped = args[0] === 'agent' && args[1] === 'mcp';
  if (args[0] === 'mcp' || scoped) {
    const action = args[scoped ? 2 : 1];
    const scope = scoped ? args[3] : 'global';
    const slug = args[scoped ? 4 : 2];
    const servers = state.mcp[scope] ??= {};
    if (action === 'list') return respond({ servers: Object.values(servers) });
    if (action === 'show') return respond(servers[slug] ?? null);
    if (action === 'probe') return respond({ tools: [] });
    if (action === 'rm') {
      delete servers[slug];
      save();
      return respond({});
    }
    if (action === 'add') {
      const server = { name: option('--name'), slug: option('--slug'), connectionStatus: 'connected', transport: { type: option('--transport'), url: option('--url') } };
      servers[server.slug] = server;
      save();
      return respond({});
    }
  }
  throw Error('Unexpected command ' + args.join(' '));
}

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'magpie-ducoro-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const paths = {
    bridge: join(directory, 'bridge.json'), library: join(directory, 'library.json'),
    mcp: join(directory, 'mcp.json'), skills: join(directory, 'skills'),
    librarySkills: join(directory, 'library-skills'), instructions: join(directory, 'instructions.md'),
    ducoroHome: join(directory, 'ducoro-home'),
  };
  const stateDir = join(directory, 'managed');
  const stateFile = join(stateDir, 'state.json');
  const cli = join(directory, 'ducoro-cli');
  const write = (file, value) => writeFile(file, JSON.stringify(value));
  const bots = botIds.map(id => ({
    id, name: id, modelPreference: { runtime: 'pi-agent', connectionSlug: fixtureOptions.connectionSlug, model: 'baseline' },
  }));
  await mkdir(stateDir);
  await Promise.all([
    write(paths.bridge, {}),
    write(paths.library, { mcp: [connector], skills: null, subagents: null, instructions: null }),
    write(paths.mcp, { mcpServers: { glossary: { type: 'http', url } } }),
    write(join(directory, 'cli-state.json'), { route: null, bots, mcp: {} }),
    writeFile(join(directory, 'cli-commands.jsonl'), ''),
    writeFile(cli, '#!/usr/bin/env node\nconst {appendFileSync,readFileSync,writeFileSync}=require("node:fs");\n(' + fakeCli.toString() + ')();\n', { mode: 0o700 }),
  ]);
  const env = {
    TEST_DUCORO_FIXTURE: directory,
    DUCORO_BRIDGE_FILE: paths.bridge, DUCORO_BRIDGE_LIBRARY_FILE: paths.library,
    DUCORO_BRIDGE_MCP_FILE: paths.mcp, DUCORO_BRIDGE_SKILLS_DIR: paths.skills,
    DUCORO_BRIDGE_LIBRARY_SKILLS_DIR: paths.librarySkills, DUCORO_BRIDGE_STATE_DIR: stateDir,
    DUCORO_BRIDGE_INSTRUCTIONS_FILE: paths.instructions, DUCORO_BRIDGE_DUCORO_HOME: paths.ducoroHome,
    DUCORO_BRIDGE_PROVIDERS_FILE: join(directory, 'providers.json'),
    DUCORO_BRIDGE_PLUGIN_PROVIDERS_FILE: join(directory, 'plugin-providers.json'),
  };
  for (const [key, value] of Object.entries(env)) {
    const previous = process.env[key];
    process.env[key] = value;
    t.after(() => { if (previous === undefined) delete process.env[key]; else process.env[key] = previous; });
  }
  const engine = options => createEngine({ directory }, { ...fixtureOptions, ...options, cli });
  const data = {
    bots: bots.map(({ id, name, modelPreference }) => ({ id, name, ...modelPreference })),
    gatewayStatus: 'connected', defaultModel: 'baseline', connectionPresent: false,
    models: [{ id: 'baseline' }, { id: 'candidate' }],
  };
  const run = async args => {
    try {
      const { stdout } = await exec(cli, [...args, '--json']);
      return { ok: true, json: JSON.parse(stdout) };
    } catch { return { ok: false }; }
  };
  const preview = (options, currentOptions = options) => buildSyncPreview({
    options: resolve(options), currentOptions: resolve(currentOptions),
    sourceOptions: options, currentSourceOptions: currentOptions,
    paths, data, stateDir, run, capabilities,
  });
  const snapshot = async () => (await readManagedState(stateFile)).state;
  const commands = async () => (await readFile(join(directory, 'cli-commands.jsonl'), 'utf8')).trim().split('\n').filter(Boolean).map(JSON.parse);
  const verification = async (options, state) => verifyConfiguration({ options, state: state ?? await snapshot(), paths, run });
  return { paths, stateDir, stateFile, engine, data, write, snapshot, commands, preview, verification };
}

test('disabled export agrees across preview, CLI revocation and readback', async t => {
  const f = await fixture(t);
  const engine = f.engine({});
  await engine.syncAll();
  const before = await f.snapshot();
  assert.ok(before.mcp['global:magpie-glossary']);
  const previousVerification = await f.verification(fixtureOptions, before);
  assert.equal(previousVerification.rows.find(row => row.resource?.name === 'glossary').status, 'verified');

  await f.write(f.paths.mcp, { mcpServers: { glossary: { disabled: true } } });
  const preview = await f.preview(fixtureOptions);
  const row = preview.rows.find(row => row.id === 'global');
  const change = row.resources.find(item => item.name === 'glossary');
  assert.equal(change.action, 'remove');
  assert.match(change.reasonMessage.$ducoroMessage, /导出的连接器已停用/);
  assert.equal(row.resources.some(item => item.action === 'update'), false);
  const count = (await f.commands()).length;
  await engine.syncAll();
  assert.deepEqual((await f.commands()).slice(count).filter(args => args[1] === 'rm'), [
    ['mcp', 'rm', 'magpie-glossary'],
  ]);
  assert.deepEqual((await f.snapshot()).mcp, {});
  const result = await f.verification(fixtureOptions, before);
  const removed = result.rows.find(row => row.resource?.name === 'glossary');
  assert.equal(removed.resource.retained, false);
  assert.equal(removed.status, 'verified');
  assert.equal(removed.stages.runtimeLoaded, 'unknown');
});

test('explicit JSON null creates the first connection and verifies it', async t => {
  const f = await fixture(t);
  await f.write(f.paths.bridge, { gateway: { url, key: 'test-secret' }, model: 'baseline', models: ['baseline'] });
  const options = { ...fixtureOptions, syncMcp: false, syncConnection: true, officialProviders: [] };
  const before = await f.verification(options, {});
  assert.equal(before.rows.find(row => row.feature === 'connection').status, 'failed');
  assert.equal(before.completion, 'partial');
  const preview = await f.preview(options);
  assert.equal(preview.rows.find(row => row.id === 'global').connection.action, 'add');
  const engine = f.engine(options);
  await engine.syncAll();
  const commands = await f.commands();
  const creation = commands.find(args => args[1] === 'add-apikey');
  assert.ok(creation);
  assert.ok(commands.findIndex(args => args[1] === 'get') < commands.indexOf(creation));
  assert.ok(creation.includes('--stdin'));
  assert.ok(!creation.includes('--capability-refs'));
  assert.ok(!creation.includes('test-secret'));
  assert.equal((await f.snapshot()).connection.model, 'baseline');
  const result = await f.verification(options);
  assert.equal(result.rows.find(row => row.feature === 'connection').status, 'verified');
  await f.write(f.paths.bridge, { gateway: { url, v1: url + '/new/v1', key: 'test-secret' }, model: 'baseline' });
  const changedUrl = await f.verification(options);
  assert.equal(changedUrl.rows.find(row => row.feature === 'connection').status, 'failed');
});

test('failed restore preflight preserves live state and does not pause sync', async t => {
  const f = await fixture(t);
  const engine = f.engine({});
  await engine.syncAll();
  const backup = await createStateBackup(f.stateFile);
  await f.write(f.paths.mcp, { mcpServers: { glossary: { disabled: true } } });
  await engine.syncAll();
  const live = await f.snapshot();
  assert.deepEqual(live.mcp, {});
  const snapshotBytes = await readFile(f.stateFile);
  const journal = await readFile(f.stateFile + '.journal').catch(error => {
    if (error.code !== 'ENOENT') throw error;
    return null;
  });
  let paused = false;
  const beforeRestore = async () => { paused = true; };
  await assert.rejects(restoreStateBackup(f.stateFile, backup.id, 'wrong', { beforeRestore }), { publicCode: 'BACKUP_PREVIEW_REQUIRED' });
  await mkdir(f.stateFile + '.before-restore');
  await assert.rejects(restoreStateBackup(f.stateFile, backup.id, backup.id, { beforeRestore }));
  assert.equal(paused, false);
  assert.deepEqual(await f.snapshot(), live);
  assert.deepEqual(await readFile(f.stateFile), snapshotBytes);
  if (journal) assert.deepEqual(await readFile(f.stateFile + '.journal'), journal);
});

test('saved trial limits subsequent syncs to its Bot until promotion, with matching readback', async t => {
  const f = await fixture(t);
  const formal = {
    ...fixtureOptions, mcpScope: 'agents',
    botPlans: Object.fromEntries(botIds.map(id => [id, 'shared'])),
    botPlansCatalog: { shared: { name: '写作方案', mcp: ['glossary'] } },
  };
  const [pilot, other] = botIds;
  const trial = {
    ...formal, planTrial: { planId: 'shared', botId: pilot, candidate: { name: '写作方案', mcp: [] } },
  };
  assert.deepEqual(validateOptions(trial), []);
  assert.deepEqual(resolve(trial), globalThis.DucoroPlans.resolve(trial));
  assert.deepEqual(source(trial, pilot, 'mcp'), globalThis.DucoroPlans.source(trial, pilot, 'mcp'));
  assert.equal(source(trial, pilot, 'mcp').trial, true);
  assert.deepEqual(resolve(trial).resourceAssignments[other].mcp, ['glossary']);
  assert.ok(validateOptions({ ...trial, botPlans: { [other]: 'shared' } }).some(error => error.field === 'planTrial'));
  await f.engine(formal).syncAll();
  const preview = await f.preview(trial, formal);
  const changes = preview.rows.flatMap(row => row.resources.filter(item => item.action === 'remove').map(item => [row.id, item]));
  assert.deepEqual(changes.map(([id]) => id), [pilot]);
  assert.match(globalThis.DucoroI18n.render(changes[0][1].reasonMessage, 'zh'), /继承方案.*写作方案.*不分配/);
  assert.equal(globalThis.DucoroI18n.render(changes[0][1].reasonMessage, 'en'),
    'The assignment changed from "Inherit plan 写作方案" to "Assign none", so this resource will be removed.');
  const initialReads = (await f.commands()).length;
  await f.engine(trial).syncAll();
  await f.engine(structuredClone(trial)).syncAll('interval');
  assert.deepEqual((await f.commands()).slice(initialReads).filter(args => args[2] === 'rm'), [
    ['agent', 'mcp', 'rm', pilot, 'magpie-glossary'],
  ]);
  const result = await f.verification(trial);
  const removal = result.rows.find(row => row.resource?.scope === pilot);
  assert.equal(removal.resource.retained, false);
  assert.equal(removal.status, 'verified');
  const inspection = await inspectBots({ options: trial, data: f.data, paths: f.paths, state: await f.snapshot(), verification: result });
  assert.deepEqual(inspection.bots[0].resources.mcp, []);
  assert.equal(inspection.bots[1].resources.mcp[0].source.plan, '写作方案');
  assert.equal(inspection.bots[1].resources.mcp[0].evidence.verified, 'verified');
  assert.ok(!JSON.stringify(inspection).includes(url));
  const beforeCancel = (await f.commands()).length;
  await f.engine({ ...trial, planTrial: null }).syncAll();
  assert.deepEqual(Object.keys((await f.snapshot()).mcp).sort(), botIds.map(id => id + ':magpie-glossary'));
  const added = (await f.commands()).slice(beforeCancel).filter(args => args[2] === 'add');
  assert.deepEqual(added.map(args => args[3]), [pilot]);
  await f.engine(trial).syncAll();
  const promoted = { ...trial, planTrial: null, botPlansCatalog: { shared: trial.planTrial.candidate } };
  const checkpoint = await createCheckpoint(f.stateDir, trial, promoted);
  const onlyTrial = checkpoint.changes.findIndex(row => row.key === 'planTrial');
  const rolledBack = await rollbackDraft(f.stateDir, checkpoint.id, [onlyTrial], promoted);
  assert.deepEqual(rolledBack.options.planTrial, trial.planTrial);
  assert.deepEqual(rolledBack.options.botPlansCatalog, formal.botPlansCatalog);
  await f.engine(promoted).syncAll();
  assert.deepEqual((await f.snapshot()).mcp, {});
});

test('idle polling backs off over five minutes and resumes quickly for active work', () => {
  const { nextDelay } = globalThis.DucoroTaskCenter;
  let now = 0, idle = 0, requests = 1;
  while (now <= 300000) {
    const next = nextDelay([], idle, false, now);
    idle = next.idle;
    now += next.delay;
    if (now <= 300000) requests++;
  }
  assert.equal(requests, 8);
  assert.deepEqual(nextDelay([], idle, true, now), { delay: 2000, idle: 0 });
  assert.equal(nextDelay([{ status: 'failed', nextRetryAt: new Date(now + 4000).toISOString() }], idle, false, now).delay, 4000);
});

test('generated and sanitized diagnostics use the package version', () => {
  const report = buildDiagnostics();
  assert.equal(report.pluginVersion, pluginVersion);
  assert.equal(sanitizeDiagnostics(report).pluginVersion, pluginVersion);
});

test('recognizes Ducoro-normalized instruction blocks without overwriting changed content', () => {
  const old = instructionBlock('baseline');
  const normalized = old.slice(1);
  assert.ok(instructionsMatch(normalized, old));
  assert.equal(mergeInstructions(normalized, old, 'baseline').profile, normalized);
  assert.ok(instructionsMatch(mergeInstructions(normalized, old, 'candidate $&').profile, instructionBlock('candidate $&')));
  assert.equal(mergeInstructions(normalized, old, '').profile, '');
  assert.equal(mergeInstructions('custom profile' + old, old, '').profile, 'custom profile');
  assert.throws(() => mergeInstructions(normalized.replace('baseline', 'user edit'), old, 'candidate'), /edited/);
  assert.throws(() => mergeInstructions(normalized + old, old, 'candidate'), /duplicated/);
});

test('instruction preview agrees with the written profile when the export ends in a newline', async t => {
  const { paths } = await fixture(t);
  const [id] = botIds;
  const library = { instructions: { agents: ['ducoro'] } };
  const options = { ...fixtureOptions, syncInstructions: true, targetAgents: [id], botInstructions: { [id]: 'Bot rules' } };
  const state = {};
  const bot = { id, profile: '' };
  await writeFile(paths.instructions, '<!-- magpie:begin -->\nGlobal rules\n<!-- magpie:end -->');
  const run = async args => {
    if (args[1] === 'list') return { ok: true, json: [bot] };
    if (args[1] === 'get') return { ok: true, json: bot };
    if (args[1] === 'update') {
      Object.assign(bot, JSON.parse(args[4]));
      return { ok: true };
    }
    throw Error(`Unexpected command ${args.join(' ')}`);
  };
  const sync = createTotalSync({ opts: options, paths, run, getState: () => state, save: async () => {}, requestRetry: () => {} });
  assert.deepEqual((await sync(library)).errors, []);
  assert.ok(bot.profile.includes('Global rules\n\n\nBot rules'));
  const desired = { skills: new Map(), mcp: new Map() };
  assert.deepEqual(await contentChanges({ paths, state, options, bots: [bot], desired, library }), []);
});

test('MCP planning retains owned slugs if the export is unreadable', () => {
  const name = 'Glossary_Provider';
  const prefix = 'custom-';
  const input = {
    library: { mcp: [{ ...connector, name }, connector] }, options: { mcpPrefix: prefix },
    scopes: { mcpScopes: botIds, skillScopes: [] }, exportReadable: false,
    state: { mcp: { otherScope: { slug: mcpSlug(name, prefix) } } },
  };
  const unreadable = desiredResources(input);
  const readable = desiredResources({ ...input, exportReadable: true });
  for (const id of botIds) {
    assert.equal(unreadable.mcp.get(id).get(name).reason, 'export-unreadable');
    assert.equal(unreadable.mcp.get(id).get(connector.name).status, 'ready');
    assert.equal(readable.mcp.get(id).get(name).status, 'ready');
  }
});

test('a skill scan produces compatible content and permission fingerprints', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'magpie-ducoro-skill-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const manifest = join(directory, 'SKILL.md');
  await writeFile(manifest, '# Example\nUse `v1.2.3`.');
  await chmod(manifest, 0o644);
  const script = join(directory, 'example.sh');
  await writeFile(script, 'exit 0\n');
  await chmod(script, 0o755);
  const managed = await skillVerificationFingerprints(directory, {}, { managed: true });
  assert.equal(managed.full, (await skillFingerprint(directory)).hash);
  assert.equal(managed.content, (await skillFingerprint(directory, { includeModes: false })).hash);
  assert.equal(managed.privateModes, (await skillFingerprint(directory, { modeMask: 0o700 })).hash);
  assert.notEqual(managed.full, managed.privateModes);
  await chmod(manifest, 0o600);
  await chmod(script, 0o700);
  const installed = await skillVerificationFingerprints(directory, {}, { managed: false });
  assert.equal(installed.content, managed.content);
  assert.equal(installed.full, managed.privateModes);
});
