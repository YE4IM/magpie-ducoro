import { readFileSync } from 'node:fs';

export const { version: pluginVersion } = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
);
