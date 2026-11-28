import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCommandRunner } from '../lib/command-runner.mjs';
import { resolveCapabilityMappings } from '../lib/model-capabilities.mjs';
import { planAccountConnector, samePolicy } from '../lib/account-plan.mjs';
import { syncAccountConnectors } from '../lib/account-connectors.mjs';
import { verifyConfiguration } from '../lib/verification.mjs';
import { resolveLocalDucoroHome } from '../lib/local-home.mjs';
import { DEFAULTS } from '../lib/defaults.mjs';
import { stableStringify } from '../lib/utils.mjs';
import * as PlanRules from '../lib/plan-rules.mjs';
import '../ui/i18n.js';
import '../ui/defaults.js';
import '../ui/model.js';
import '../ui/plans.js';

test('createCommandRunner preserves GATEWAY_SUPERSEDED code when gateway signal aborts read', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'magpie-ducoro-runner-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const cli = join(dir, 'slow-cli');
  await writeFile(cli, '#!/usr/bin/env node\nsetTimeout(() => {}, 10000);\n', { mode: 0o700 });

  const controller = new AbortController();
  const run = createCommandRunner({
    opts: { cli },
    dryRun: false,
    rememberSecret: () => {},
    log: () => {},
    getGatewaySignal: () => controller.signal,
    gatewayAbortError: () =>
      Object.assign(new Error('gateway sync superseded by a resource change'), {
        name: 'AbortError',
        code: 'GATEWAY_SUPERSEDED',
      }),
  });

  const promise = run(['connections', 'get', 'magpie-ducoro'], { timeoutMs: 5000 });
  setTimeout(() => controller.abort(), 25);
  await assert.rejects(promise, error => {
    assert.equal(error.code, 'GATEWAY_SUPERSEDED');
    assert.equal(error.outcomeUnknown, true);
    return true;
  });
});

test('verifyConfiguration reuses a single agent list call across models and instructions', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'magpie-ducoro-verify-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const paths = {
    bridge: join(dir, 'bridge.json'),
    library: join(dir, 'library.json'),
    mcp: join(dir, 'mcp.json'),
    instructions: join(dir, 'instructions.md'),
    ducoroHome: join(dir, 'ducoro-home'),
  };
  await mkdir(paths.ducoroHome, { recursive: true });
  await Promise.all([
    writeFile(paths.bridge, JSON.stringify({ gateway: { url: 'http://127.0.0.1:19999', key: 'k' }, model: 'baseline' })),
    writeFile(paths.library, JSON.stringify({ mcp: [], skills: [], subagents: [], instructions: { agents: ['ducoro'] } })),
    writeFile(paths.mcp, JSON.stringify({ mcpServers: {} })),
    writeFile(paths.instructions, '<!-- magpie:begin -->\nKeep concise.\n<!-- magpie:end -->\n'),
  ]);

  let agentListCalls = 0;
  const bot = {
    id: 'agt-alpha',
    name: 'Alpha',
    profile: '\n\n<!-- magpie-ducoro-total:begin -->\nKeep concise.\n<!-- magpie-ducoro-total:end -->\n',
    modelPreference: { runtime: 'pi-agent', connectionSlug: DEFAULTS.connectionSlug, model: 'baseline' },
  };
  const run = async args => {
    const cmd = args.join(' ');
    if (cmd === 'agent list') {
      agentListCalls++;
      return { ok: true, json: [bot] };
    }
    if (cmd === 'agent get agt-alpha') return { ok: true, json: bot };
    if (cmd === 'connections list --with-status') {
      return { ok: true, json: [{ slug: DEFAULTS.connectionSlug, defaultModel: 'baseline', baseUrl: 'http://127.0.0.1:19999/v1' }] };
    }
    if (cmd === 'info') return { ok: true, json: { paths: { ducoroHome: paths.ducoroHome } } };
    return { ok: true, json: {} };
  };

  const result = await verifyConfiguration({
    options: {
      ...DEFAULTS,
      syncConnection: true,
      syncAgentModels: true,
      syncInstructions: true,
      syncMcp: false,
      syncSkills: false,
      syncSubagents: false,
    },
    state: {
      connection: { slug: DEFAULTS.connectionSlug, baseUrl: 'http://127.0.0.1:19999/v1' },
      total: {
        profiles: {
          'agt-alpha': {
            block: '\n\n<!-- magpie-ducoro-total:begin -->\nKeep concise.\n<!-- magpie-ducoro-total:end -->\n',
          },
        },
        files: {},
      },
    },
    run,
    paths,
  });

  assert.equal(agentListCalls, 1);
  assert.equal(result.rows.find(r => r.feature === 'models' && r.target === 'agt-alpha').status, 'verified');
  assert.equal(result.rows.find(r => r.feature === 'instructions' && r.target === 'agt-alpha').status, 'verified');
});

test('resolveCapabilityMappings handles group expansion, cycles, provider priority, overrides, and capability mismatches', () => {
  const catalog = [
    { provider: 'openrouter', id: 'claude-3-7-sonnet', name: 'Claude 3.7 Sonnet', contextWindow: 200000 },
    { provider: 'anthropic', id: 'claude-3-7-sonnet', name: 'Claude 3.7 Sonnet', contextWindow: 200000 },
    { provider: 'openai', id: 'gpt-4o', name: 'GPT-4o', contextWindow: 128000, thinkingCapability: { depths: ['high'] } },
  ];
  const providers = {
    providers: [
      { id: 'vendor-a', models: [{ id: 'claude-3-7-sonnet', context: 200000, efforts: [] }] },
      { id: 'vendor-b', models: [{ id: 'gpt-4o', context: 64000, efforts: ['low'] }] },
    ],
    groups: [
      { id: 'sonnet', members: ['vendor-a/claude-3-7-sonnet'] },
      { id: 'gpt', members: ['vendor-b/gpt-4o'] },
      { id: 'loop-a', members: ['group/loop-b'] },
      { id: 'loop-b', members: ['group/loop-a'] },
    ],
  };

  const result = resolveCapabilityMappings({
    ids: ['group/sonnet', 'group/gpt', 'group/loop-a', 'vendor-a/claude-3-7-sonnet'],
    catalog,
    providers,
    officialProviders: ['openai', 'anthropic'],
    overrides: { 'vendor-a/claude-3-7-sonnet': 'openrouter/claude-3-7-sonnet' },
  });

  assert.equal(result.refs['group/sonnet'], 'anthropic/claude-3-7-sonnet');
  assert.equal(result.entries.find(e => e.id === 'group/sonnet').source, 'automatic');
  assert.equal(result.entries.find(e => e.id === 'group/gpt').status, 'capability-mismatch');
  assert.ok(result.entries.find(e => e.id === 'group/gpt').warnings.includes('reference-context-exceeds-member-limit'));
  assert.equal(result.entries.find(e => e.id === 'group/loop-a').status, 'cyclic-group');
  assert.equal(result.refs['vendor-a/claude-3-7-sonnet'], 'openrouter/claude-3-7-sonnet');
  assert.equal(result.entries.find(e => e.id === 'vendor-a/claude-3-7-sonnet').source, 'option');
});

test('account-plan and syncAccountConnectors detect external conflicts and restore previous policies', async () => {
  const previous = { allow: ['read'], deny: ['delete'] };
  const want = { allow: ['read', 'write'], deny: [] };
  const conflictPlan = planAccountConnector(
    { allow: ['read', 'admin'], deny: [] },
    want,
    { previous, applied: want },
  );
  assert.equal(conflictPlan.conflict, true);
  assert.equal(conflictPlan.action, 'conflict');

  const connectorStore = { 'agt-alpha': { github: { ...previous } } };
  const commands = [];
  const state = {};
  const run = async args => {
    commands.push(args);
    const cmd = args.join(' ');
    if (cmd === 'agent list') return { ok: true, json: [{ id: 'agt-alpha', modelPreference: { runtime: 'pi-agent' } }] };
    if (cmd === 'agent connector list agt-alpha') {
      return {
        ok: true,
        json: Object.entries(connectorStore['agt-alpha']).map(([slug, p]) => ({ slug, ...p })),
      };
    }
    if (cmd === 'mcp catalog status github') return { ok: true, json: { status: 'connected' } };
    if (cmd === 'mcp catalog tools github') return { ok: true, json: [{ slug: 'read' }, { slug: 'write' }] };
    if (args[2] === 'update') {
      const allow = args[args.indexOf('--allow') + 1].split(',').filter(Boolean);
      const denyIdx = args.indexOf('--deny');
      const deny = denyIdx >= 0 ? args[denyIdx + 1].split(',').filter(Boolean) : [];
      connectorStore['agt-alpha'].github = { allow, deny };
      return { ok: true, json: {} };
    }
    throw Error('Unexpected command ' + cmd);
  };

  await syncAccountConnectors({
    options: { syncMcp: true, accountConnectors: { 'agt-alpha': { github: want } } },
    state,
    run,
    save: async () => {},
  });
  assert.equal(samePolicy(connectorStore['agt-alpha'].github, want), true);
  assert.equal(samePolicy(state.accountConnectors['agt-alpha'].github.previous, previous), true);

  // Removing the plugin assignment restores the prior user policy instead of deleting it.
  await syncAccountConnectors({
    options: { syncMcp: true, accountConnectors: {} },
    state,
    run,
    save: async () => {},
  });
  assert.equal(samePolicy(connectorStore['agt-alpha'].github, previous), true);
  assert.equal(state.accountConnectors['agt-alpha'], undefined);
  assert.ok(commands.some(c => c[2] === 'update'));
});

test('lib/plan-rules.mjs and ui/plans.js maintain parity across all operations', async () => {
  await globalThis.DucoroUIReady;
  const options = {
    ...DEFAULTS,
    modelScope: 'agents',
    mcpScope: 'agents',
    skillsScope: 'agents',
    botPlansCatalog: {
      writer: { name: 'Writer', model: 'gpt-4o', mcp: ['glossary'], skills: ['style'], instructions: 'Write clearly.' },
    },
    botPlans: { 'agt-a': 'writer', 'agt-b': 'writer' },
    botModels: { 'agt-b': 'claude-3' },
    resourceAssignments: { 'agt-b': { mcp: [] } },
    botInstructions: { 'agt-b': 'Extra rule.' },
    planTrial: {
      planId: 'writer',
      botId: 'agt-a',
      candidate: { name: 'Writer', model: 'o3', mcp: ['glossary'], skills: [] },
    },
  };
  const inventory = { defaultModel: 'baseline', library: { mcp: [{ name: 'glossary' }], skills: [{ name: 'style' }] } };

  assert.deepEqual(PlanRules.resolve(options), globalThis.DucoroPlans.resolve(options));
  for (const id of ['global', 'agt-a', 'agt-b']) {
    for (const kind of ['model', 'mcp', 'skills', 'instructions']) {
      assert.deepEqual(PlanRules.source(options, id, kind), globalThis.DucoroPlans.source(options, id, kind));
    }
  }
  assert.deepEqual(
    PlanRules.copyEffective(options, 'agt-a', ['agt-b'], ['model', 'mcp', 'skills'], inventory),
    globalThis.DucoroPlans.copyEffective(options, 'agt-a', ['agt-b'], ['model', 'mcp', 'skills'], inventory),
  );
  assert.deepEqual(PlanRules.clearOverrides(options, 'agt-b'), globalThis.DucoroPlans.clearOverrides(options, 'agt-b'));

  const legacyDraft = {
    selected: 'writer',
    dirty: true,
    targets: ['agt-a'],
    values: ['Writer', '', 'glossary', '', 'Write clearly.'],
  };
  assert.deepEqual(
    PlanRules.editorSnapshot(legacyDraft, options),
    globalThis.DucoroPlans.editorSnapshot(legacyDraft, options),
  );
});

test('stableStringify sorts keys deterministically by code point in backend and UI', async () => {
  await globalThis.DucoroUIReady;
  const sample = { b: 1, A_1: 2, a: 3, B: 4 };
  const expected = '{"A_1":2,"B":4,"a":3,"b":1}';
  assert.equal(stableStringify(sample), expected);
  assert.equal(globalThis.DucoroUI.stable(sample), expected);
});

test('resolveLocalDucoroHome validates local server URL and matching home path', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'magpie-ducoro-home-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const run = async () => ({ ok: true, json: { paths: { ducoroHome: dir } } });
  const resolved = await resolveLocalDucoroHome({
    paths: { ducoroHome: dir },
    run,
    env: { DUCORO_SERVER_URL: 'http://127.0.0.1:4100' },
  });
  assert.ok(resolved);

  await assert.rejects(
    resolveLocalDucoroHome({
      paths: { ducoroHome: dir },
      run,
      env: { DUCORO_SERVER_URL: 'https://remote.example:4100' },
      notLocalMessage: 'not local',
    }),
    /not local/,
  );

  await assert.rejects(
    resolveLocalDucoroHome({
      paths: { ducoroHome: dir },
      run: async () => ({ ok: true, json: { paths: { ducoroHome: tmpdir() } } }),
      env: {},
      notLocalMessage: 'not local',
    }),
    /not local/,
  );
});
