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

// A list entry or redacted transport is never sufficient creation evidence.
export function readableMcpHash(value) {
  const server=value?.server??value,t=server?.transport;
  if(!server||typeof server.slug!=='string'||!t||!['stdio','http','sse'].includes(t.type)||typeof server.name!=='string')throw Error('Incomplete MCP readback');
  const pairs=value=>Array.isArray(value)?value:Object.entries(value??{});
  if(t.type==='stdio'&&typeof t.command!=='string'||t.type!=='stdio'&&typeof t.url!=='string')throw Error('Incomplete MCP transport');
  if(server.redacted||t.redacted)throw Error('Redacted MCP readback');
  return defHash({name:server.name,transport:t.type,command:t.type==='stdio'?t.command:null,args:t.type==='stdio'?(t.args??[]):null,url:t.type==='stdio'?null:t.url,headers:pairs(t.headers),env:pairs(t.env),disabledTools:server.toolPolicy?.deny??server.disabledTools??[]});
}

export const totalTargets = (bots, options) => bots.filter(bot => options.targetAgents?.length ? options.targetAgents.includes(bot.id) : (bot.modelPreference?.connectionSlug ?? bot.connectionSlug) === options.connectionSlug);
