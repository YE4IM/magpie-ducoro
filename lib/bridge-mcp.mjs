import { mcpServerArgs } from "./mcp-update.mjs"
import { commandFailure } from "./operation-controls.mjs"
import { defHash } from "./resource-fingerprint.mjs"
import { sha256, slugify } from "./resource-plan.mjs"
import { mcpCommand } from "./resource-scopes.mjs"
import { trimmedString as str } from "./utils.mjs"

// ducoro-cli cannot carry commas inside single-use --env/--header/--args
// flags; comma-bearing values move into the encrypted credential store and
// are referenced as {{credentials.slug}}.
const materializeSecrets = async (def, { run, dryRun = false }) => {
  def.credentialRefs = []
  const conv = async (pairs, kind) => {
    const out = []
    for (const [k, v] of pairs) {
      if (v.includes(",")) {
        // ducoro-cli credential refs must be "<provider>:<variant>" in
        // kebab-case halves
        const cslug = `${def.slug}:${kind}-${slugify(k).slice(0, 25)}-${sha256(k).slice(0, 12)}`
        const r = dryRun
          ? { ok: true }
          : await run(
              ["credentials", "put", "--slug", cslug, "--kind", "mcp_credential", "--stdin"],
              { stdin: v, timeoutMs: 30_000 },
            )
        if (!r.ok) throw Object.assign(Error("could not store MCP credential"), commandFailure(r))
        out.push([k, `{{credentials.${cslug}}}`])
        def.credentialRefs.push(cslug)
      } else {
        out.push([k, v])
      }
    }
    return out
  }
  if (def.env?.length) def.env = await conv(def.env, "env")
  if (def.headers?.length) def.headers = await conv(def.headers, "hdr")
}

const validOwner = (id, mine) =>
  Boolean(mine) &&
  (mine.scope === "global" || /^agt-[A-Za-z0-9-]+$/.test(mine.scope ?? "")) &&
  typeof mine.slug === "string" &&
  id === `${mine.scope}:${mine.slug}`

export function createMcpSync({
  dryRun,
  run,
  getState,
  saveState,
  operations,
  diagnostics,
  requestRetry,
  log,
  warnOnce,
  errMsg,
  isNotFound,
  isSuperseded,
  reconcileCreations,
}) {
  const mcpListCache = new Map()
  const pendingMcpProbes = new Map()
  let forceMcpProbe = false
  let authorizedMcpSlugs = new Set()
  let probeDrain = null

  const queueProbe = (id, scope, slug) => {
    pendingMcpProbes.set(id, { scope, slug, roundId: diagnostics.token() })
  }

  const listMcpSlugs = async (scope) => {
    if (mcpListCache.has(scope)) return mcpListCache.get(scope)
    const r = await run(mcpCommand(scope, "list"), { timeoutMs: 30_000 })
    if (!r.ok) {
      log(`mcp list (${scope}) failed: ${errMsg(r)}`)
      requestRetry("mcp-sync")
      return null
    }
    const arr = Array.isArray(r.json?.servers)
      ? r.json.servers
      : Array.isArray(r.json)
        ? r.json
        : null
    if (!arr) {
      if (dryRun) return new Map()
      log("mcp list returned an unknown response; resource changes postponed")
      requestRetry("mcp-sync")
      return null
    }
    const map = new Map(arr.filter((s) => str(s?.slug)).map((s) => [s.slug, s]))
    mcpListCache.set(scope, map)
    return map
  }

  const addMcpServer = (scope, def) => {
    mcpListCache.delete(scope)
    return run(
      mcpCommand(
        scope,
        "add",
        "--slug", def.slug,
        "--name", def.name,
        "--transport", def.transport,
        ...mcpServerArgs(def),
      ),
      { timeoutMs: 60_000 },
    )
  }

  const updateMcpServer = async (scope, slug, def) => {
    mcpListCache.delete(scope)
    const current = await run(mcpCommand(scope, "show", slug), { timeoutMs: 30_000 })
    if (!current.ok) return current
    let args
    try {
      args = mcpServerArgs(def, true, current.json?.server ?? current.json)
    } catch (error) {
      return { ok: false, json: { error: { code: "configuration-conflict", message: error.message } } }
    }
    return run(
      mcpCommand(scope, "update", slug, "--name", def.name, "--transport", def.transport, ...args),
      { timeoutMs: 60_000 },
    )
  }

  const probeMcp = async (scope, slug, roundId) => {
    const r = await run(mcpCommand(scope, "probe", slug, "--timeout-ms", "15000"), { timeoutMs: 30_000 })
    if (r.ok) {
      const tools = r.json?.tools
      const n = Array.isArray(tools)
        ? tools.length
        : typeof r.json?.toolsCount === "number"
          ? r.json.toolsCount
          : null
      log(`mcp ${slug} probe ok${n != null ? ` (${n} tools)` : ""}`)
    } else {
      log(`mcp ${slug} probe failed: ${errMsg(r)}`)
      if (diagnostics.isCurrent(roundId)) requestRetry("mcp-probe")
    }
    await diagnostics.probeResult(roundId, r.ok)
    return r.ok
  }

  const drainMcpProbes = () => {
    if (probeDrain) return probeDrain
    probeDrain = (async () => {
      while (pendingMcpProbes.size) {
        const [id, { scope, slug, roundId }] = pendingMcpProbes.entries().next().value
        pendingMcpProbes.delete(id)
        if (authorizedMcpSlugs.has(id)) await probeMcp(scope, slug, roundId)
      }
    })().finally(() => {
      probeDrain = null
    })
    return probeDrain
  }

  const migrateMcpOwnership = async () => {
    const state = getState()
    let changed = false
    for (const [id, mine] of Object.entries(state.mcp)) {
      if (typeof mine === "string") {
        state.mcp[`global:${id}`] = { scope: "global", slug: id, hash: mine }
        delete state.mcp[id]
        changed = true
      } else if (!validOwner(id, mine)) {
        throw new Error("invalid MCP ownership state; scope changes postponed")
      }
    }
    if (changed) await saveState()
  }

  const syncMcp = async ({ resourcePlan, desiredPlan }) => {
    await reconcileCreations("mcp")
    await migrateMcpOwnership()
    const state = getState()
    const wanted = new Map()
    for (const scope of resourcePlan.mcpScopes) {
      for (const entry of desiredPlan.mcp.get(scope)?.values() ?? []) {
        if (entry.status === "unknown") requestRetry("mcp-sync")
        wanted.set(`${scope}:${entry.slug}`, { scope, slug: entry.slug, def: entry.definition })
      }
    }
    authorizedMcpSlugs = new Set(wanted.keys())
    const scopes = new Set([
      ...resourcePlan.mcpScopes,
      ...Object.values(state.mcp).map((mine) => mine.scope),
    ])
    const current = new Map(
      await Promise.all([...scopes].map(async (scope) => [scope, await listMcpSlugs(scope)])),
    )

    // Apply every known revocation before additions. On a scope switch, a
    // failed old-layer cleanup must not be described as successful isolation.
    let revocationFailed = false
    for (const [id, mine] of Object.entries(state.mcp)) {
      if (wanted.has(id)) continue
      pendingMcpProbes.delete(id)
      if (!current.get(mine.scope)) {
        revocationFailed = true
        continue
      }
      mcpListCache.delete(mine.scope)
      const r = await run(mcpCommand(mine.scope, "rm", mine.slug), { timeoutMs: 30_000 })
      if (r.ok || isNotFound(r)) {
        delete state.mcp[id]
        await saveState([["mcp", id]])
        log(`removed MCP server ${mine.slug} (${mine.scope}; no longer selected)`)
      } else {
        log(`removing MCP server ${mine.slug} (${mine.scope}) failed: ${errMsg(r)}`)
        requestRetry("mcp-sync")
        revocationFailed = true
      }
    }
    if (revocationFailed) return

    for (const [id, { scope, slug, def: source }] of wanted) {
      if (isSuperseded()) return
      const layer = current.get(scope)
      if (!source || !layer || state.creations?.[`mcp:${id}`]) continue
      if (layer.has(slug) && !state.mcp[id]) {
        warnOnce(`mcp:${id}`, `MCP slug "${slug}" (${scope}) belongs to the user; skipped`)
        requestRetry("mcp-conflict")
        continue
      }
      // Each scope receives its own copy: materializing credential references
      // in one Bot must not change another Bot's source digest.
      const def = structuredClone(source)
      const hash = defHash(def)
      const mine = state.mcp[id]
      const changed = !layer.has(slug) || mine?.hash !== hash
      const operation = await operations.begin("mcp", scope, slug, hash, ["revoke-mcp"], !changed)
      if (!operation) {
        if (changed) requestRetry("mcp-sync")
        if (forceMcpProbe || layer.get(slug)?.connectionStatus !== "connected") {
          queueProbe(id, scope, slug)
        }
        continue
      }
      if (!changed) {
        await operations.finish(operation)
        if (forceMcpProbe || layer.get(slug)?.connectionStatus !== "connected") {
          queueProbe(id, scope, slug)
        }
        continue
      }
      try {
        await materializeSecrets(def, { run, dryRun })
      } catch (error) {
        await operations.finish(operation, false, [], error)
        log(`mcp ${slug} (${scope}) skipped: could not store its credential`)
        requestRetry("mcp-sync")
        continue
      }
      if (!layer.has(slug)) {
        state.creations ??= {}
        state.creations[`mcp:${id}`] = {
          kind: "mcp",
          scope,
          name: slug,
          sourceName: source.name,
          hash,
          contentHash: defHash(def),
        }
        await saveState([["creations", `mcp:${id}`]])
      }
      const r = layer.has(slug)
        ? await updateMcpServer(scope, slug, def)
        : await addMcpServer(scope, def)
      if (r.ok) {
        state.mcp[id] = { scope, slug, hash, sourceName: source.name }
        const hadCreation = Boolean(
          state.creations && Object.hasOwn(state.creations, `mcp:${id}`),
        )
        if (hadCreation) delete state.creations[`mcp:${id}`]
        await operations.finish(operation, true, [
          ["mcp", id],
          ...(hadCreation ? [["creations", `mcp:${id}`]] : []),
        ])
        queueProbe(id, scope, slug)
      } else {
        await operations.finish(operation, false, [], Object.assign(Error(errMsg(r)), commandFailure(r)))
        log(`saving MCP server ${slug} (${scope}) failed (kept for retry): ${errMsg(r)}`)
        requestRetry("mcp-sync")
      }
    }
  }

  const clearProbes = () => {
    authorizedMcpSlugs.clear()
    pendingMcpProbes.clear()
  }

  return {
    listMcpSlugs,
    invalidateListCache: () => mcpListCache.clear(),
    syncMcp,
    drainMcpProbes,
    clearProbes,
    setForceProbe: (value) => { forceMcpProbe = value },
  }
}
