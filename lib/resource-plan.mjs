// Pure desired-state rules shared by preview and execution. Unknown sources retain ownership.
import { createHash } from 'node:crypto';
import { scopedLibrary } from './resource-scopes.mjs';
import { selected } from './inventory-shapes.mjs';
const str = value => typeof value === 'string' ? value.trim() : '';
export const sha256 = (s) => createHash("sha256").update(String(s)).digest("hex").slice(0, 20)

export const slugify = (s) =>
  String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "x"

// Keep existing canonical names readable. Lossy normalization needs a stable
// suffix: a_b, a-b, A-B and long/non-ASCII names must never share an identity.
export const mcpSlug = (name, prefix) => {
  const source = String(name)
  const simple = slugify(source)
  return prefix + (source === simple && !/-[a-f0-9]{12}$/.test(source)
    ? simple
    : `${simple.slice(0, 35).replace(/-+$/, "")}-${sha256(source).slice(0, 12)}`)
}

export const mapServer = (name, def, prefix) => {
  if (!def || typeof def !== "object") return null
  if (def.disabled === true || def.enabled === false) return null
  const slug = mcpSlug(name, prefix)
  const type = str(def.type).toLowerCase()
  const headers = def.headers && typeof def.headers === "object"
    ? Object.entries(def.headers).map(([k, v]) => [k, String(v)])
    : []
  if (type === "http" || type === "sse" || (!def.command && def.url)) {
    const url = str(def.url)
    if (!url) return null
    return { slug, name, transport: type === "sse" ? "sse" : "http", url, headers, env: [], command: null, args: null }
  }
  if (def.command) {
    const args = Array.isArray(def.args) ? def.args.map((a) => String(a)) : []
    const env = def.env && typeof def.env === "object"
      ? Object.entries(def.env).map(([k, v]) => [k, String(v)])
      : []
    return { slug, name, transport: "stdio", command: String(def.command), args, env, url: null, headers: [] }
  }
  return null
}


export function normalizeMcp(server, exported, {prefix = 'magpie-', env = {}, exportReadable = true, owned = false, ownedSlugs} = {}) {
  const name = str(server.name), slug = mcpSlug(name, prefix);
  const unknown = reason => ({name, slug, status:'unknown', definition:null, reason});
  if (!exportReadable && (owned || ownedSlugs?.has(slug))) return unknown('export-unreadable');
  const direct = exported?.mcpServers?.[name];
  let def = direct ?? {...server, type:server.transport};
  if (direct?.url && /\/mcp\/magpie\/hub(?:\/|$)/.test(direct.url)) def = {...server, type:server.transport};
  if (def.disabled === true || def.enabled === false) return null;
  try {
    const expand = value => typeof value === 'string' ? value.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_,key) => {
      if (env[key] === undefined) throw Error('missing environment variable');
      return env[key];
    }) : value;
    def = {...def, command:expand(def.command), url:expand(def.url),
      args:Array.isArray(def.args) ? def.args.map(expand) : def.args,
      env:Object.fromEntries(Object.entries(def.env ?? {}).map(([k,v])=>[k,expand(v)])),
      headers:Object.fromEntries(Object.entries(def.headers ?? {}).map(([k,v])=>[k,expand(v)]))};
    const definition = mapServer(name, def, prefix);
    if (!definition || definition.transport === 'stdio' && definition.args.some(arg=>arg.includes(','))) return unknown('definition-unmappable');
    definition.disabledTools = Array.isArray(server.disabledTools) ? server.disabledTools.map(String) : [];
    return {name, slug, status:'ready', definition};
  } catch { return unknown('definition-unreadable'); }
}

export function desiredResources({library, options, scopes, exported, exportReadable = true, state = {}, env = {}}) {
  const plan = {mcp:new Map(), skills:new Map()};
  const mcpScopes = options.syncLibraryMcp === false ? [] : scopes.mcpScopes;
  const mcpOptions = {prefix:String(options.mcpPrefix ?? 'magpie-'), env, exportReadable};
  if (!exportReadable && mcpScopes.length) mcpOptions.ownedSlugs = new Set(Object.values(state.mcp ?? {}).map(record => record?.slug));
  for (const kind of ['mcp','skills']) {
    const targets = kind === 'mcp' ? mcpScopes : scopes.skillScopes;
    for (const scope of targets) {
      const entries = new Map();
      for (const item of selected(scopedLibrary(library, options, kind, scope)[kind])) {
        const name = str(item.name);
        if (!name) continue;
        const entry = kind === 'skills' ? {name, status:'ready'} : normalizeMcp(item, exported, mcpOptions);
        if (entry) entries.set(name, entry);
      }
      plan[kind].set(scope, entries);
    }
  }
  return plan;
}

export function resourceTransitions(owned, wanted) {
  const changes = [];
  for (const scope of new Set([...owned.keys(), ...wanted.keys()])) {
    const before = owned.get(scope) ?? new Set(), after = wanted.get(scope) ?? new Map();
    for (const name of new Set([...before, ...after.keys()]))
      if (before.has(name) !== after.has(name)) changes.push({scope, name, action:after.has(name)?'add':'remove'});
  }
  return changes;
}
