import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPageService } from '../lib/page-service.mjs';
import { DEFAULTS } from '../lib/defaults.mjs';
import { pluginVersion } from '../lib/version.mjs';
import { saveManagedState } from '../lib/state-store.mjs';
import { buildDiagnostics } from '../lib/diagnostics.mjs';

function sendRequest(urlString, path, { method = 'GET', headers = {}, body } = {}) {
  const url = new URL(path, urlString);
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method,
        headers,
      },
      res => {
        const chunks = [];
        res.on('data', chunk => chunks.push(chunk));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          let json = null;
          try { json = JSON.parse(text); } catch {}
          resolve({ status: res.statusCode, headers: res.headers, text, json });
        });
      },
    );
    req.on('error', reject);
    if (body !== undefined) req.write(typeof body === 'string' ? body : JSON.stringify(body));
    req.end();
  });
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

async function setupService(t, extraOptions = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'magpie-ducoro-page-test-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const stateDir = join(dir, 'state');
  await mkdir(stateDir, { recursive: true });
  const paths = {
    bridge: join(dir, 'bridge.json'),
    library: join(dir, 'library.json'),
    mcp: join(dir, 'mcp.json'),
    skills: join(dir, 'skills'),
    librarySkills: join(dir, 'library-skills'),
    instructions: join(dir, 'instructions.md'),
    ducoroHome: join(dir, 'ducoro-home'),
  };
  await Promise.all([
    writeFile(paths.bridge, JSON.stringify({ gateway: { url: 'http://127.0.0.1:19999', key: 'k' }, model: 'baseline' })),
    writeFile(paths.library, JSON.stringify({ mcp: [], skills: [], subagents: [], instructions: null })),
    writeFile(paths.mcp, JSON.stringify({ mcpServers: {} })),
  ]);

  const servicePort = await freePort();
  const options = { ...DEFAULTS, servicePort, ...extraOptions };
  const triggers = [];
  const bots = [
    { id: 'agt-alpha', name: 'Alpha', modelPreference: { runtime: 'pi-agent', connectionSlug: options.connectionSlug, model: 'baseline' } },
  ];
  const run = async args => {
    const cmd = args.join(' ');
    if (cmd === 'agent list') return { ok: true, json: bots };
    if (cmd === 'connections list --with-status') {
      return { ok: true, json: [{ slug: options.connectionSlug, defaultModel: 'baseline', availableModelInfos: [{ id: 'baseline', name: 'Baseline' }] }] };
    }
    if (cmd === 'mcp catalog') return { ok: true, json: { connectorSource: 'ok', entries: [] } };
    if (cmd.startsWith('agent connector list ')) return { ok: true, json: [] };
    return { ok: true, json: {} };
  };

  const service = await createPageService({
    options,
    paths,
    stateDir,
    run,
    trigger: (reason, delay) => triggers.push({ reason, delay }),
    getReport: async () => buildDiagnostics(),
    getProgress: () => ({ current: null, history: [] }),
    getModelCatalog: async () => ({ entries: [], models: [] }),
  });
  t.after(() => service.close());

  const token = (await readFile(join(stateDir, 'page-token'), 'utf8')).trim();
  const host = new URL(service.url).host;
  return { dir, stateDir, paths, options, service, token, host, triggers };
}

test('page service enforces host, origin, token, CORS preflight, and static allowlist', async t => {
  const { service, token } = await setupService(t);

  const badHost = await sendRequest(service.url, '/api/lock', {
    headers: { Host: 'evil.example:3487', 'X-Ducoro-Token': token },
  });
  assert.equal(badHost.status, 403);

  const badOrigin = await sendRequest(service.url, '/api/lock', {
    headers: { Origin: 'https://evil.example', 'X-Ducoro-Token': token },
  });
  assert.equal(badOrigin.status, 403);

  const badToken = await sendRequest(service.url, '/api/lock', {
    headers: { 'X-Ducoro-Token': 'wrong-token' },
  });
  assert.equal(badToken.status, 403);

  const preflight = await sendRequest(service.url, '/api/lock', {
    method: 'OPTIONS',
    headers: { Origin: 'null' },
  });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers['access-control-allow-origin'], 'null');

  const missingAsset = await sendRequest(service.url, '/package.json');
  assert.equal(missingAsset.status, 404);

  const nonGetStatic = await sendRequest(service.url, '/index.html', { method: 'POST' });
  assert.equal(nonGetStatic.status, 405);

  const html = await sendRequest(service.url, '/index.html');
  assert.equal(html.status, 200);
  assert.ok(html.text.includes(pluginVersion));
  assert.ok(html.text.includes(`<meta name="ducoro-token" content="${token}">`));
});

test('page service serves core inventory, preview, checkpoint, operation, draft, backup, and retry routes', async t => {
  const { stateDir, options, service, token, triggers } = await setupService(t);
  const auth = { 'X-Ducoro-Token': token, 'Content-Type': 'application/json' };

  const inv = await sendRequest(service.url, '/api/inventory', { headers: auth });
  assert.equal(inv.status, 200);
  assert.equal(inv.json.bots.length, 1);
  assert.ok(inv.json.inventoryToken);

  const validCheck = await sendRequest(service.url, '/api/validate', {
    method: 'POST',
    headers: auth,
    body: { connectionSlug: 'valid-slug' },
  });
  assert.equal(validCheck.status, 200);
  assert.equal(validCheck.json.valid, true);

  const invalidCheck = await sendRequest(service.url, '/api/validate', {
    method: 'POST',
    headers: auth,
    body: { mcpScope: 'invalid-scope' },
  });
  assert.equal(invalidCheck.status, 400);

  const preview = await sendRequest(service.url, '/api/preview', {
    method: 'POST',
    headers: { ...auth, 'X-Ducoro-Inventory': inv.json.inventoryToken },
    body: {},
  });
  assert.equal(preview.status, 200);
  assert.ok(Array.isArray(preview.json.rows));
  assert.ok(preview.json.updatedAt);

  const cpList = await sendRequest(service.url, '/api/checkpoints', { headers: auth });
  assert.equal(cpList.status, 200);
  assert.ok(cpList.json.revision);

  const cpMismatch = await sendRequest(service.url, '/api/checkpoints', {
    method: 'POST',
    headers: auth,
    body: { before: { ...options, connectionSlug: 'stale-slug' }, after: options },
  });
  assert.equal(cpMismatch.status, 409);

  const cpCreated = await sendRequest(service.url, '/api/checkpoints', {
    method: 'POST',
    headers: auth,
    body: { before: options, after: { ...options, connectionSlug: 'updated-slug' } },
  });
  assert.equal(cpCreated.status, 200);
  assert.ok(cpCreated.json.checkpoint.id);

  const opId = 'a'.repeat(64);
  await saveManagedState(join(stateDir, 'state.json'), {
    v: 2,
    connection: null,
    mcp: {},
    skills: {},
    operations: {
      [opId]: {
        feature: 'mcp',
        target: 'global',
        resource: 'glossary',
        revision: 'b'.repeat(64),
        dependencies: [],
        status: 'failed',
        failureClass: 'temporary',
        attempts: 1,
        updatedAt: '2026-11-28T00:00:00.000Z',
      },
    },
  });

  const opsList = await sendRequest(service.url, '/api/operations', { headers: auth });
  assert.equal(opsList.status, 200);
  assert.equal(opsList.json.summary.failed, 1);

  const badOp = await sendRequest(service.url, '/api/operations', {
    method: 'POST',
    headers: auth,
    body: { id: 'bad', action: 'retry' },
  });
  assert.equal(badOp.status, 422);

  const missingOp = await sendRequest(service.url, '/api/operations', {
    method: 'POST',
    headers: auth,
    body: { id: 'c'.repeat(64), action: 'retry' },
  });
  assert.equal(missingOp.status, 409);

  const retryOp = await sendRequest(service.url, '/api/operations', {
    method: 'POST',
    headers: auth,
    body: { id: opId, action: 'retry' },
  });
  assert.equal(retryOp.status, 200);
  assert.equal(retryOp.json.queued, true);

  const backups = await sendRequest(service.url, '/api/state-backups', { headers: auth });
  assert.equal(backups.status, 200);
  assert.ok(Array.isArray(backups.json.backups));

  const localRecs = await sendRequest(service.url, '/api/local-records', { headers: auth });
  assert.equal(localRecs.status, 200);

  const lockInfo = await sendRequest(service.url, '/api/lock', { headers: auth });
  assert.equal(lockInfo.status, 200);

  const draftGet = await sendRequest(service.url, '/api/draft', { headers: auth });
  assert.equal(draftGet.status, 200);
  const draftPost = await sendRequest(service.url, '/api/draft', {
    method: 'POST',
    headers: auth,
    body: { base: options, options: { ...options, syncMcp: false }, editor: null },
  });
  assert.equal(draftPost.status, 200);
  assert.equal(draftPost.json.saved, true);

  const retryOk = await sendRequest(service.url, '/api/retry', { method: 'POST', headers: auth, body: {} });
  assert.equal(retryOk.status, 200);
  assert.equal(retryOk.json.queued, true);
  assert.ok(triggers.some(item => item.reason === 'page-retry'));

  await writeFile(join(stateDir, 'restore-review.json'), JSON.stringify({ pending: true, at: new Date().toISOString() }));
  const retryBlocked = await sendRequest(service.url, '/api/retry', { method: 'POST', headers: auth, body: {} });
  assert.equal(retryBlocked.status, 409);
});
