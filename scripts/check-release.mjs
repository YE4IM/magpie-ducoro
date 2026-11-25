import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pluginVersion } from '../lib/version.mjs';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');
const lock = JSON.parse(await read('../package-lock.json'));
assert.equal(lock.version, pluginVersion);
assert.equal(lock.packages[''].version, pluginVersion);

for (const file of ['README.md', 'README-zh-CN.md']) {
  const examples = [...(await read('../' + file)).matchAll(/(?:magpie-ducoro@|magpie-ducoro#v)(\d+\.\d+\.\d+)/g)];
  assert.ok(examples.length, file + ' is missing versioned installation examples');
  for (const [, version] of examples) assert.equal(version, pluginVersion, file);
}
