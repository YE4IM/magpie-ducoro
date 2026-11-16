import { createHash } from 'node:crypto';
const shortDigest = s => createHash('sha256').update(s).digest('hex').slice(0,20);
export const defHash = (def) => {
  // env/headers are key-value maps: hash them order-insensitively; args keep
  // their order (it is semantic).
  const canon = (pairs) =>
    JSON.stringify(
      (pairs ?? [])
        .map(([k, v]) => [k, v])
        .sort((x, y) => (x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : 0)),
    )
  return shortDigest(
    JSON.stringify({
      name: def.name,
      transport: def.transport,
      command: def.command,
      args: def.args,
      url: def.url,
      headers: canon(def.headers),
      env: canon(def.env),
      disabledTools: [...(def.disabledTools ?? [])].sort(),
    }),
  )
}

export const totalTargets = (bots, options) => bots.filter(bot => options.targetAgents?.length ? options.targetAgents.includes(bot.id) : (bot.modelPreference?.connectionSlug ?? bot.connectionSlug) === options.connectionSlug);
