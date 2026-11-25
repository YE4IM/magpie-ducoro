import { readFile } from 'node:fs/promises';
import { resolve, source } from './plan-rules.mjs';
import { selected } from './inventory-shapes.mjs';
import { validateLibrary } from './library-schema.mjs';
import { desiredResources } from './resource-plan.mjs';
import { totalTargets } from './resource-fingerprint.mjs';
import { planResourceScopes, findUnavailableAssignments } from './resource-scopes.mjs';
import { modelEligible, modelTarget } from './model-sync.mjs';
import { revision } from './control-center.mjs';

export async function inspectBots({ options, data, paths, state, verification, signal }) {
  const resolved = resolve(options);
  const bots = data.bots.map(bot => ({
    ...bot, modelPreference: { runtime: bot.runtime, connectionSlug: bot.connectionSlug, model: bot.model },
  }));
  let library, desired, unavailable = [];
  try {
    library = validateLibrary(JSON.parse(await readFile(paths.library, { encoding: 'utf8', signal })));
    const exported = await readFile(paths.mcp, { encoding: 'utf8', signal }).then(JSON.parse).catch(() => null);
    signal?.throwIfAborted();
    const scopes = planResourceScopes(resolved, bots);
    desired = desiredResources({ library, options: resolved, scopes, exported, exportReadable: !!exported, state, env: process.env });
    unavailable = findUnavailableAssignments(library, resolved, scopes);
  } catch {
    signal?.throwIfAborted();
  }
  const instructionIds = new Set(totalTargets(bots, resolved).map(bot => bot.id));
  const rows = verification?.rows ?? [];
  const evidence = new Map(rows.map(row => [
    JSON.stringify(row.resource ? [row.feature, row.resource.scope, row.resource.name, row.resource.retained] : [row.feature, row.target]),
    row.stages,
  ]));
  const perTarget = (kind, target) => evidence.get(JSON.stringify([kind, target])) ?? null;
  const resources = kind => selected(library?.[kind]).map(item => item.name.trim());
  return {
    updatedAt: new Date().toISOString(),
    evidenceAt: verification?.updatedAt ?? null,
    resources: library ? { mcp: resources('mcp'), skills: resources('skills') } : null,
    assignmentsKnown: !!desired,
    bots: bots.map(({ modelPreference, ...bot }) => ({
      ...bot,
      expectedModel: resolved.syncConnection && resolved.syncAgentModels && data.gatewayStatus === 'connected' &&
        modelEligible(resolved, { id: bot.id, modelPreference }) ? modelTarget(resolved, bot.id, data.defaultModel) : null,
      modelSource: source(options, bot.id, 'model'),
      modelEvidence: perTarget('models', bot.id),
      instructionRevision: revision(resolved.syncInstructions && instructionIds.has(bot.id) ? resolved.botInstructions?.[bot.id]?.trim() || '' : ''),
      instructionEvidence: perTarget('instructions', bot.id),
      unavailable: unavailable.filter(issue => issue.scope === bot.id).map(issue => issue.kind),
      resources: desired ? Object.fromEntries(['mcp', 'skills'].map(kind => {
        const scoped = desired[kind].get(bot.id) ?? new Map();
        const global = bot.runtime === 'pi-agent' ? desired[kind].get('global') ?? new Map() : new Map();
        return [kind, [...new Map([...global, ...scoped]).values()].map(entry => {
          const scope = scoped.has(entry.name) ? bot.id : 'global';
          return {
            name: entry.name, status: entry.status, source: source(options, scope, kind),
            evidence: evidence.get(JSON.stringify([kind, scope, entry.name, true])) ?? null,
          };
        })];
      })) : null,
    })),
  };
}
