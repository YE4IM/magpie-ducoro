import test from 'node:test';
import assert from 'node:assert/strict';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import net from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _internal } from '../bridge.mjs';
import { DEFAULTS } from '../lib/defaults.mjs';
import { readManagedState, saveManagedState } from '../lib/state-store.mjs';

const { createEngine } = _internal;

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
  if (args[0] === 'info') return respond({ paths: { ducoroHome: state.ducoroHome } });
  if (args.join(' ') === 'agent list') return respond(state.bots);
  if (args[0] === 'connections') {
    if (args[1] === 'get') return respond(state.route);
    if (args[1] === 'list') return respond(state.route ? [state.route] : []);
    if (args[1] === 'catalog') return respond([]);
  }
  if (args[0] === 'mcp' && args[1] === 'catalog') return respond([]);

  const scopedMcp = args[0] === 'agent' && args[1] === 'mcp';
  if (args[0] === 'mcp' || scopedMcp) {
    const action = args[scopedMcp ? 2 : 1];
    const scope = scopedMcp ? args[3] : 'global';
    const slug = args[scopedMcp ? 4 : 2];
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
      const server = {
        name: option('--name'),
        slug: option('--slug'),
        connectionStatus: 'connected',
        transport: { type: option('--transport'), url: option('--url') },
      };
      servers[server.slug] = server;
      save();
      return respond({});
    }
  }

  const scopedSkill = args[0] === 'agent' && args[1] === 'skill';
  if (args[0] === 'skill' || scopedSkill) {
    const action = args[scopedSkill ? 2 : 1];
    const scope = scopedSkill ? args[3] : 'global';
    const target = args[scopedSkill ? 4 : 2];
    const skills = state.skills[scope] ??= {};
    if (action === 'list') return respond({ skills: Object.keys(skills) });
    if (action === 'show') return respond(skills[target] ?? null);
    if (action === 'remove') {
      delete skills[target];
      save();
      return respond({});
    }
    if (action === 'rename') {
      const to = option('--to');
      if (!skills[target]) throw Error('Missing skill for rename: ' + target);
      skills[to] = { ...skills[target], name: to };
      delete skills[target];
      save();
      return respond({});
    }
    if (action === 'import') {
      const md = readFileSync(target + '/SKILL.md', 'utf8');
      const match = /^name:\s*(.+)$/m.exec(md);
      const name = (match ? match[1] : target.split('/').pop()).trim();
      const dest = state.ducoroHome + '/skills/' + scope + '/' + name;
      mkdirSync(dest, { recursive: true });
      cpSync(target, dest, { recursive: true });
      skills[name] = { name, dirPath: dest };
      save();
      return respond(skills[name]);
    }
  }

  throw Error('Unexpected command ' + args.join(' '));
}

async function setupFixture(t, extraOptions = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'magpie-ducoro-lifecycle-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const paths = {
    bridge: join(directory, 'bridge.json'),
    library: join(directory, 'library.json'),
    mcp: join(directory, 'mcp.json'),
    skills: join(directory, 'skills'),
    librarySkills: join(directory, 'library-skills'),
    instructions: join(directory, 'instructions.md'),
    ducoroHome: join(directory, 'ducoro-home'),
  };
  const stateDir = join(directory, 'managed');
  const stateFile = join(stateDir, 'state.json');
  const cli = join(directory, 'ducoro-cli');
  await mkdir(stateDir, { recursive: true });
  await mkdir(paths.ducoroHome, { recursive: true });
  await mkdir(paths.librarySkills, { recursive: true });
  await Promise.all([
    writeFile(paths.bridge, '{}'),
    writeFile(paths.library, JSON.stringify({ mcp: [], skills: [], subagents: null, instructions: null })),
    writeFile(paths.mcp, JSON.stringify({ mcpServers: {} })),
    writeFile(join(directory, 'cli-state.json'), JSON.stringify({
      route: null,
      bots: [],
      mcp: {},
      skills: {},
      ducoroHome: paths.ducoroHome,
    })),
    writeFile(join(directory, 'cli-commands.jsonl'), ''),
    writeFile(
      cli,
      '#!/usr/bin/env node\nconst {appendFileSync,cpSync,mkdirSync,readFileSync,writeFileSync}=require("node:fs");\n(' + fakeCli.toString() + ')();\n',
      { mode: 0o700 },
    ),
  ]);

  const env = {
    TEST_DUCORO_FIXTURE: directory,
    DUCORO_BRIDGE_FILE: paths.bridge,
    DUCORO_BRIDGE_LIBRARY_FILE: paths.library,
    DUCORO_BRIDGE_MCP_FILE: paths.mcp,
    DUCORO_BRIDGE_SKILLS_DIR: paths.skills,
    DUCORO_BRIDGE_LIBRARY_SKILLS_DIR: paths.librarySkills,
    DUCORO_BRIDGE_STATE_DIR: stateDir,
    DUCORO_BRIDGE_INSTRUCTIONS_FILE: paths.instructions,
    DUCORO_BRIDGE_DUCORO_HOME: paths.ducoroHome,
    DUCORO_BRIDGE_PROVIDERS_FILE: join(directory, 'providers.json'),
    DUCORO_BRIDGE_PLUGIN_PROVIDERS_FILE: join(directory, 'plugin-providers.json'),
  };
  for (const [key, value] of Object.entries(env)) {
    const previous = process.env[key];
    process.env[key] = value;
    t.after(() => {
      if (previous === undefined) delete process.env[key];
      else process.env[key] = previous;
    });
  }

  const baseOptions = {
    ...DEFAULTS,
    cli,
    dryRun: false,
    syncConnection: false,
    syncAgentModels: false,
    syncMcp: false,
    syncSkills: false,
    syncInstructions: false,
    syncSubagents: false,
    ...extraOptions,
  };
  const create = (overrides = {}) => createEngine({ directory }, { ...baseOptions, ...overrides });
  const commands = async () =>
    (await readFile(join(directory, 'cli-commands.jsonl'), 'utf8'))
      .trim()
      .split('\n')
      .filter(Boolean)
      .map(JSON.parse);
  const snapshot = async () => (await readManagedState(stateFile)).state;
  return { directory, paths, stateDir, stateFile, create, commands, snapshot };
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(err => (err ? reject(err) : resolve(port)));
    });
  });
}

test('engine start/stop prevents post-stop triggers and supports clean restart', async t => {
  const port = await freePort();
  const f = await setupFixture(t, { servicePort: port });
  const engine = f.create();
  t.after(() => engine.stop());

  await engine.start();
  assert.ok(engine.watchedPaths.length > 0);
  const reportBeforeStop = engine.getReport();
  assert.ok(reportBeforeStop);

  await engine.stop();
  assert.deepEqual(engine.watchedPaths, []);

  const commandsBeforeTrigger = (await f.commands()).length;
  engine.trigger('file-change', 0);
  await new Promise(resolve => setTimeout(resolve, 60));
  assert.equal((await f.commands()).length, commandsBeforeTrigger);

  await engine.start();
  assert.ok(engine.watchedPaths.length > 0);
  await engine.stop();
  assert.deepEqual(engine.watchedPaths, []);
});

test('engine start rolls back watching state on startup failure so subsequent start succeeds', async t => {
  const port = await freePort();
  const f = await setupFixture(t, { servicePort: port });
  await rm(f.stateDir, { recursive: true, force: true });
  await writeFile(f.stateDir, 'not-a-directory');

  const engine = f.create();
  t.after(() => engine.stop());

  await assert.rejects(() => engine.start());
  assert.deepEqual(engine.watchedPaths, []);

  await rm(f.stateDir, { force: true });
  await mkdir(f.stateDir, { recursive: true });
  await engine.start();
  assert.ok(engine.watchedPaths.length > 0);
  await engine.stop();
});

test('saveManagedState incremental path writes persist updates and deletions via journal', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'magpie-ducoro-state-paths-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const file = join(dir, 'state.json');

  const state = {
    v: 2,
    connection: null,
    mcp: {
      'global:a': { scope: 'global', slug: 'a', hash: 'h1', sourceName: 'a' },
      'global:b': { scope: 'global', slug: 'b', hash: 'h2', sourceName: 'b' },
    },
    skills: {
      'global:s1': { scope: 'global', name: 's1', sourceName: 's1', hash: 'sh1' },
    },
    creations: {
      'mcp:global:c': {
        kind: 'mcp',
        scope: 'global',
        name: 'c',
        sourceName: 'c',
        hash: 'h3',
        contentHash: 'ch3',
      },
    },
  };

  await saveManagedState(file, state, {
    paths: [['mcp', 'global:a'], ['mcp', 'global:b'], ['skills', 'global:s1'], ['creations', 'mcp:global:c']],
  });

  state.mcp['global:a'].hash = 'h1-next';
  delete state.mcp['global:b'];
  delete state.creations['mcp:global:c'];
  await saveManagedState(file, state, {
    paths: [['mcp', 'global:a'], ['mcp', 'global:b'], ['creations', 'mcp:global:c']],
  });

  // Replay from a copied snapshot + journal to bypass the in-memory cache.
  const copy = join(dir, 'copy.json');
  await copyFile(file, copy);
  await copyFile(file + '.journal', copy + '.journal');
  const replayed = (await readManagedState(copy)).state;
  assert.equal(replayed.mcp['global:a'].hash, 'h1-next');
  assert.equal(replayed.mcp['global:b'], undefined);
  assert.equal(replayed.skills['global:s1'].hash, 'sh1');
  assert.deepEqual(replayed.creations, {});
});

test('syncMcp revokes unselected servers before adding replacements', async t => {
  const f = await setupFixture(t, { syncMcp: true });
  const c1 = { name: 'alpha', transport: 'http', url: 'http://127.0.0.1:19991', agents: ['ducoro'] };
  const c2 = { name: 'beta', transport: 'http', url: 'http://127.0.0.1:19992', agents: ['ducoro'] };
  await writeFile(f.paths.mcp, JSON.stringify({
    mcpServers: {
      alpha: { type: 'http', url: c1.url },
      beta: { type: 'http', url: c2.url },
    },
  }));
  await writeFile(f.paths.library, JSON.stringify({ mcp: [c1], skills: [], subagents: null, instructions: null }));

  const engine = f.create();
  await engine.syncAll();
  assert.deepEqual(Object.keys((await f.snapshot()).mcp), ['global:magpie-alpha']);

  const beforeSecond = (await f.commands()).length;
  await writeFile(f.paths.library, JSON.stringify({ mcp: [c2], skills: [], subagents: null, instructions: null }));
  await engine.syncAll();

  const roundCmds = (await f.commands()).slice(beforeSecond);
  const rmIndex = roundCmds.findIndex(args => args[0] === 'mcp' && args[1] === 'rm' && args[2] === 'magpie-alpha');
  const addIndex = roundCmds.findIndex(args => args[0] === 'mcp' && args[1] === 'add' && args.includes('magpie-beta'));
  assert.ok(rmIndex >= 0, 'expected mcp rm for alpha');
  assert.ok(addIndex >= 0, 'expected mcp add for beta');
  assert.ok(rmIndex < addIndex, 'revocation must precede addition');
  assert.deepEqual(Object.keys((await f.snapshot()).mcp), ['global:magpie-beta']);
});

test('syncSkills revokes unselected skills before importing new ones', async t => {
  const f = await setupFixture(t, { syncSkills: true });
  for (const name of ['skill-one', 'skill-two']) {
    const dir = join(f.paths.librarySkills, name);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'SKILL.md'), `---\nname: ${name}\n---\n# ${name}\n`);
  }

  await writeFile(f.paths.library, JSON.stringify({
    mcp: [],
    skills: [{ name: 'skill-one', agents: ['ducoro'] }],
    subagents: null,
    instructions: null,
  }));

  const engine = f.create();
  await engine.syncAll();
  assert.deepEqual(Object.keys((await f.snapshot()).skills), ['global:skill-one']);

  const beforeSecond = (await f.commands()).length;
  await writeFile(f.paths.library, JSON.stringify({
    mcp: [],
    skills: [{ name: 'skill-two', agents: ['ducoro'] }],
    subagents: null,
    instructions: null,
  }));
  await engine.syncAll();

  const roundCmds = (await f.commands()).slice(beforeSecond);
  const rmIndex = roundCmds.findIndex(args => args[0] === 'skill' && args[1] === 'remove' && args[2] === 'skill-one');
  const importIndex = roundCmds.findIndex(args => args[0] === 'skill' && args[1] === 'import');
  assert.ok(rmIndex >= 0, 'expected skill remove for skill-one');
  assert.ok(importIndex >= 0, 'expected skill import for skill-two');
  assert.ok(rmIndex < importIndex, 'skill revocation must precede import');
  assert.deepEqual(Object.keys((await f.snapshot()).skills), ['global:skill-two']);
});

test('reconcileCreations and syncMcp reuse per-round MCP list cache per scope', async t => {
  const f = await setupFixture(t, { syncMcp: true });
  const c1 = { name: 'alpha', transport: 'http', url: 'http://127.0.0.1:19991', agents: ['ducoro'] };
  await writeFile(f.paths.mcp, JSON.stringify({ mcpServers: { alpha: { type: 'http', url: c1.url } } }));
  await writeFile(f.paths.library, JSON.stringify({ mcp: [c1], skills: [], subagents: null, instructions: null }));

  await saveManagedState(f.stateFile, {
    v: 2,
    connection: null,
    mcp: {},
    skills: {},
    creations: {
      'mcp:global:magpie-alpha': {
        kind: 'mcp',
        scope: 'global',
        name: 'magpie-alpha',
        sourceName: 'alpha',
        hash: 'stale-hash',
        contentHash: 'stale-content',
      },
    },
  });

  const engine = f.create();
  await engine.syncAll();

  const listCalls = (await f.commands()).filter(args => args[0] === 'mcp' && args[1] === 'list');
  assert.equal(listCalls.length, 1);
  assert.deepEqual(Object.keys((await f.snapshot()).mcp), ['global:magpie-alpha']);
});

test('legacy un-scoped state.skills migration persists on disk and drops old key', async t => {
  const f = await setupFixture(t, { syncSkills: true });
  const dir = join(f.paths.librarySkills, 'skill-one');
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'SKILL.md'), '---\nname: skill-one\n---\n# skill-one\n');
  await writeFile(f.paths.library, JSON.stringify({
    mcp: [],
    skills: [{ name: 'skill-one', agents: ['ducoro'] }],
    subagents: null,
    instructions: null,
  }));

  const engine = f.create();
  await engine.syncAll();
  const initialHash = (await f.snapshot()).skills['global:skill-one'].hash;

  // Rewrite state.json using the legacy un-scoped skill format.
  await rm(f.stateFile + '.journal', { force: true });
  await writeFile(f.stateFile, JSON.stringify({
    v: 2,
    connection: null,
    mcp: {},
    skills: { 'skill-one': { hash: initialHash, dir } },
  }));

  await engine.syncAll();
  const diskCopy = join(f.stateDir, 'disk-check.json');
  await copyFile(f.stateFile, diskCopy);
  const journalPath = f.stateFile + '.journal';
  await copyFile(journalPath, diskCopy + '.journal').catch(e => { if (e.code !== 'ENOENT') throw e; });
  const persisted = (await readManagedState(diskCopy)).state;
  const snapshot = await f.snapshot();
  assert.equal(Object.hasOwn(persisted.skills, 'skill-one'), false);
  assert.equal(Object.hasOwn(snapshot.skills, 'skill-one'), false);
  assert.equal(persisted.skills['global:skill-one'].scope, 'global');
});

test('degraded watch fallback does not amplify timers across poll cycles', async t => {
  if (process.getuid?.() === 0) return;
  const { chmod } = await import('node:fs/promises');
  const port = await freePort();
  const f = await setupFixture(t, { servicePort: port, syncMcp: true });
  await mkdir(f.paths.skills, { recursive: true });
  await chmod(f.paths.skills, 0o000);
  t.after(() => chmod(f.paths.skills, 0o700).catch(() => {}));

  const originalSetTimeout = globalThis.setTimeout;
  const fallbackDelays = [];
  globalThis.setTimeout = (fn, delay, ...args) => {
    if (fn?.name === 'checkFallback') fallbackDelays.push(delay);
    return originalSetTimeout(fn, delay, ...args);
  };
  t.after(() => { globalThis.setTimeout = originalSetTimeout; });

  const engine = f.create();
  t.after(() => engine.stop());
  await engine.start();
  await new Promise(resolve => originalSetTimeout(resolve, 1250));
  const reportWhileRunning = engine.getReport();
  await engine.stop();

  // Initial 1000ms timer plus at most one rescheduled 2000ms backoff timer (never exponential 2^N).
  assert.ok(fallbackDelays.length >= 1 && fallbackDelays.length <= 3, `unexpected fallback timer count: ${fallbackDelays.length}`);
  assert.equal(reportWhileRunning.issues.some(issue => issue.code === 'watch-error' || issue.code === 'watch-missing'), true);
});
