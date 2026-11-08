import { maintainLocalRecords } from "./local-records.mjs"
import { createSkillArtifacts } from "./skill-artifacts.mjs"
import { createOperationStore } from "./operation-store.mjs"
import { readCachedFile, clearFileCache, fileMetrics } from "./file-cache.mjs"
import "./ui/plans.js"
import { createReadCoordinator, createProgress } from "./performance.mjs"
// Ducoro connector bridge — the Bun main module of magpie-ducoro.
//
// Runs inside magpie's plugin host. Watches the three artifacts the Ducoro
// agent declaration (ducoro.agent.js) produces and keeps Ducoro in sync
// through `ducoro-cli`:
//
//   ~/.ducoro/magpie-agent.json   gateway url + per-agent key + selected model
//                                 -> one OpenAI-compatible Connection
//                                    (preset custom-openai-compat, runtime pi-agent)
//   ~/.ducoro/magpie-mcp.json     library MCP servers, claude format
//                                 -> global MCP server definitions
//   ~/.ducoro/magpie-skills/      library skill bundles (links or copies)
//                                 -> imported skill bundles
//
// Magpie library.json is the authoritative per-agent resource selection.
// Never add the all-plugin /mcp/magpie/tools endpoint automatically.
//
// Everything it creates is tracked in a state file under magpie's config
// directory, so only this plugin ever touches what it created. Secrets never
// sit in Ducoro's MCP definitions in plaintext: env/header values that
// ducoro-cli cannot carry inline (they contain commas) are stored in the
// encrypted credential store and referenced as {{credentials.slug}}.
//
// This file must export exactly one plugin function (plus _internal helpers).

import { createPageService } from "./page-service.mjs"
import { readManagedState, saveManagedState, compactManagedState } from "./state-store.mjs"
import { sourceFingerprint, createFallbackPoll } from "./watch-fallback.mjs"
import { syncAccountConnectors } from "./account-connectors.mjs"
import { createCommandRunner } from "./command-runner.mjs"
import { watch as fsWatch } from "node:fs"
import {
  chmod,
  mkdir,
  readdir,
  readFile,
  realpath,
  rename,
  stat,
  rm,
  writeFile,
} from "node:fs/promises"
import { createHash } from "node:crypto"
import { homedir } from "node:os"
import { basename, dirname, join } from "node:path"
import { pathToFileURL } from "node:url"

import { createTotalSync } from "./total.mjs"
import { createModelSync } from "./model-sync.mjs"
import { OFFICIAL_PROVIDERS, resolveCapabilityMappings, createCapabilityCatalog } from "./model-capabilities.mjs"
import { mcpCommand, needsResourceTargets, planResourceScopes, scopedLibrary, validateResourceOptions, findUnavailableAssignments } from "./resource-scopes.mjs"
import { createDiagnostics, removeLegacyReports } from "./diagnostics.mjs"
import { validateOptions } from "./options.mjs"

const HOME = homedir()

const pathFromEnv = (name, dflt) => {
  const v = process.env[name]
  return v && v.trim() ? v.trim() : dflt
}

const DEFAULT_PATHS = {
  bridge: join(HOME, ".ducoro", "magpie-agent.json"),
  mcp: join(HOME, ".ducoro", "magpie-mcp.json"),
  skills: join(HOME, ".ducoro", "magpie-skills"),
}

export const DEFAULTS = {
  botPlansCatalog: {}, botPlans: {}, botInstructions: {}, pausedModels: [], modelGuards: {},
  cli: "ducoro-cli",
  servicePort: 3487,
  modelScope: "global",
  botModels: {},
  accountConnectors: {},
  accountResolutions: {},
  connectionSlug: "magpie-ducoro",
  connectionName: "Magpie gateway",
  syncConnection: true,
  syncAgentModels: true,
  officialProviders: OFFICIAL_PROVIDERS,
  modelCapabilityRefs: {},
  syncMcp: true,
  mcpScope: "global", // "global" or "agents"
  syncSkills: true,
  syncInstructions: true,
  syncSubagents: true,
  targetAgents: [],
  subagentNames: [],
  resourceAssignments: {},
  syncLibraryMcp: true,
  // Legacy options are only used to identify an old owned aggregate for removal.
  syncPluginTools: false,
  mcpToolsSlug: "magpie-tools",
  mcpToolsName: "Magpie plugin tools",
  mcpPrefix: "magpie-",
  skillsScope: "global", // "global", "agents", or an exact Bot id
  prune: true,
  onDisconnect: "keep", // "keep" | "remove"
  intervalMs: 120_000,
  dryRun: false,
}

// ---------------------------------------------------------------- helpers

const sha256 = (s) => createHash("sha256").update(String(s)).digest("hex").slice(0, 20)

const slugify = (s) =>
  String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "x"

// Keep existing canonical names readable. Lossy normalization needs a stable
// suffix: a_b, a-b, A-B and long/non-ASCII names must never share an identity.
const mcpSlug = (name, prefix) => {
  const source = String(name)
  const simple = slugify(source)
  return prefix + (source === simple && !/-[a-f0-9]{12}$/.test(source)
    ? simple
    : `${simple.slice(0, 35).replace(/-+$/, "")}-${sha256(source).slice(0, 12)}`)
}

const str = (v) => (typeof v === "string" ? v.trim() : "")

const normalizeModel = (model) => {
  if (!model) return null
  if (typeof model === "string") return model.trim() || null
  if (typeof model === "object") return str(model.id) || null
  return null
}

// magpie hands `models` to connect() in the same shape as `model`; accept
// arrays of objects/strings and plain id-keyed objects alike.
const modelIds = (models) => {
  if (Array.isArray(models))
    return models
      .map((m) => (typeof m === "string" ? m : str(m?.id)))
      .filter(Boolean)
  if (models && typeof models === "object") return Object.keys(models).filter(Boolean)
  return []
}

// ~/.ducoro/magpie-mcp.json is written in claude format: { mcpServers: {...} }
const parseLibMcp = (json) => {
  if (!json || typeof json !== "object") return {}
  const servers = json.mcpServers
  return servers && typeof servers === "object" ? servers : {}
}

// claude-format server definition -> our internal shape (null when unmappable)
const mapServer = (name, def, prefix) => {
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

const defHash = (def) => {
  // env/headers are key-value maps: hash them order-insensitively; args keep
  // their order (it is semantic).
  const canon = (pairs) =>
    JSON.stringify(
      (pairs ?? [])
        .map(([k, v]) => [k, v])
        .sort((x, y) => (x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : 0)),
    )
  return sha256(
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

// SKILL.md frontmatter name, falling back to the directory name
const skillName = (md, fallback) => {
  const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(String(md))
  if (fm) {
    const m = /^name:\s*["']?([^"'\n]+?)["']?\s*$/m.exec(fm[1])
    if (m && m[1].trim()) return m[1].trim()
  }
  return fallback
}

// Ducoro's dead-link validator treats every backticked dotted token as a
// file. Versions (0.9.x) and Windows executable names (heptabase.cmd) are
// prose, not bundle files. HTML code keeps the same rendered instructions
// without creating fake companion files or hiding missing relative paths.
const compatibleSkillMarkdown = (md, fileNames) => md.replace(/`([^`\n]+)`/g, (match, token) => {
  if (fileNames.has(token)) return match
  const version = /^v?\d+(?:\.\d+)+(?:\.[xX*])?(?:-[a-zA-Z0-9.-]+)?$/.test(token)
  const executable = /^[a-zA-Z0-9_-]+\.(?:cmd|exe|bat)$/i.test(token)
  return version || executable ? `<code>${token}</code>` : match
})

const sameSet = (a, b) => {
  const norm = (x) => (Array.isArray(x) ? [...x].map(String).sort() : [])
  return JSON.stringify(norm(a)) === JSON.stringify(norm(b))
}

const sameObj = (a, b) => {
  const norm = (x) => {
    if (!x || typeof x !== "object" || Array.isArray(x)) return ""
    return Object.keys(x)
      .sort()
      .map((k) => `${k}=${x[k]}`)
      .join("|")
  }
  return norm(a) === norm(b)
}

const NOT_FOUND_RE = /not_found|notfound|no (mcp server|connection|skill|credential)|no such|unknown (slug|connection)/i

// ---------------------------------------------------------------- engine

const createEngine = (input = {}, options = {}) => {
  const opts = { ...DEFAULTS }
  const merge = (o) => {
    if (o && typeof o === "object" && !Array.isArray(o)) {
      for (const [k, v] of Object.entries(o)) if (v !== undefined && k in DEFAULTS) opts[k] = v
    }
  }
  merge(options)
  merge(input?.magpie?.options)
  merge(input?.magpie?.option)

  const rawOptions = structuredClone(opts)
  if (!validateOptions(opts).length) Object.assign(opts, globalThis.DucoroPlans.resolve(opts))
  const progress = createProgress()
  const dryRun = opts.dryRun === true || opts.dryRun === "true"

  const configDir = str(input?.directory) || str(input?.worktree) ||
    join(pathFromEnv("XDG_CONFIG_HOME", join(HOME, ".config")), "magpie")
  const paths = {
    bridge: pathFromEnv("DUCORO_BRIDGE_FILE", DEFAULT_PATHS.bridge),
    mcp: pathFromEnv("DUCORO_BRIDGE_MCP_FILE", DEFAULT_PATHS.mcp),
    skills: pathFromEnv("DUCORO_BRIDGE_SKILLS_DIR", DEFAULT_PATHS.skills),
    library: pathFromEnv("DUCORO_BRIDGE_LIBRARY_FILE", join(configDir, "library.json")),
    librarySkills: pathFromEnv("DUCORO_BRIDGE_LIBRARY_SKILLS_DIR", join(configDir, "library", "skills")),
    providers: pathFromEnv("DUCORO_BRIDGE_PROVIDERS_FILE", join(configDir, "providers.json")),
    pluginProviders: pathFromEnv("DUCORO_BRIDGE_PLUGIN_PROVIDERS_FILE", join(configDir, "plugin-providers.json")),
  }
  const stateDir = pathFromEnv(
    "DUCORO_BRIDGE_STATE_DIR",
    join(configDir, "ducoro-bridge"),
  )
  const stateFile = join(stateDir, "state.json")
  paths.instructions = pathFromEnv("DUCORO_BRIDGE_INSTRUCTIONS_FILE", join(HOME, ".ducoro", "magpie-instructions.md"))
  paths.ducoroHome = pathFromEnv("DUCORO_BRIDGE_DUCORO_HOME", join(HOME, ".ducoro"))
  const diagnostics = createDiagnostics({ options: opts })
  let totalForRound = null
  let capabilitiesForRound = null

  const knownSecrets = new Set()
  const rememberSecret = (value) => {
    if (value !== undefined && value !== null && String(value)) {
      const text = String(value)
      knownSecrets.add(text)
      // CLI errors sometimes echo the token without its authorization scheme.
      const authorization = /^(?:Bearer|Basic)\s+(.+)$/i.exec(text)
      if (authorization) knownSecrets.add(authorization[1])
    }
  }
  const redact = (value) => {
    let out = String(value)
    for (const secret of [...knownSecrets].sort((a, b) => b.length - a.length)) out = out.split(secret).join("[redacted]")
    return out.replace(/https?:\/\/[^\s<>"')]+/g, (text) => {
      try {
        const url = new URL(text)
        if (url.username || url.password) { url.username = "redacted"; url.password = "redacted" }
        for (const key of [...url.searchParams.keys()]) url.searchParams.set(key, "redacted")
        if (url.hash) url.hash = "redacted"
        return url.toString()
      } catch { return "[redacted-url]" }
    })
  }
  const log = (...a) => console.log("[ducoro-bridge]", ...a.map(redact))
  const warned = new Set()
  const warnOnce = (key, msg) => {
    // A repeated conflict is still part of this round's diagnostics even when
    // the human-readable log has already been emitted by this host.
    const feature = key.startsWith("conn:") ? "connection" : key.startsWith("mcp:") ? "mcp" : key.startsWith("skill:") ? "skills" : null
    if (feature) diagnostics.retry("ownership-conflict", feature === "connection" ? ["connection", "models"] : [feature])
    if (warned.has(key)) return
    warned.add(key)
    log("note:", msg)
  }

  // ------------------------------------------------------------- state

  let state = { v: 2, connection: null, mcp: {}, skills: {} }
  let stateLoaded = false

  const loadState = async () => {
    if (stateLoaded) return
    const loaded = await readManagedState(stateFile)
    state = loaded.state
    stateLoaded = true
  }

  let stateSaveQueue = Promise.resolve()
  const saveState = () => {
    const task = stateSaveQueue.then(async () => {
    if (dryRun) return
    try {
      await mkdir(stateDir, { recursive: true })
      await saveManagedState(stateFile, state)
    } catch (e) {
      log("cannot save state:", e?.message ?? e)
      throw e
    }
    })
    stateSaveQueue = task.catch(() => {})
    return task
  }

  const operations = createOperationStore({ getState: () => state, save: saveState })

  // --------------------------------------------------------------- cli

  let activeGatewayController = null
  const gatewayAbortError = () => Object.assign(new Error("gateway sync superseded by a resource change"), { name: "AbortError", code: "GATEWAY_SUPERSEDED" })
  const interruptGatewayReads = () => activeGatewayController?.abort()

  const run = createReadCoordinator(createCommandRunner({opts,dryRun,rememberSecret,log,getGatewaySignal: () => activeGatewayController?.signal,gatewayAbortError}))

  const errMsg = (r) => {
    const j = r.json?.error?.message ?? r.json?.error?.code
    if (j) return redact(j)
    const line = (r.stderr || r.stdout || "").trim().split("\n")[0]
    return redact(line || `exit code ${r.code}`)
  }

  const isNotFound = (r) =>
    !r.ok && (NOT_FOUND_RE.test(r.stderr) || NOT_FOUND_RE.test(r.stdout) || NOT_FOUND_RE.test(errMsg(r)))

  const readJson = async (p) => {
    try {
      return JSON.parse(await readFile(p, "utf8"))
    } catch {
      return null
    }
  }

  const readJsonDetailed = async (path) => {
    try { return { ok: true, value: JSON.parse(await readFile(path, "utf8")) } }
    catch (e) { return { ok: false, missing: e.code === "ENOENT" } }
  }

  // ------------------------------------------------- capability mapping

  // Map magpie model ids ("zcode/GLM-5.3-Flash") to Ducoro catalog entries
  // ("zai/glm-5.3-flash") so explicit thinking levels resolve. Best effort:
  // refs are optional in Ducoro.
  const capabilityCatalog = createCapabilityCatalog({ run, log })
  const loadCatalog = () => capabilityCatalog.load()

  const refsFor = async (ids, existing, descriptors) => {
    const [cat, providers, pluginProviders] = await Promise.all([
      ids.length ? loadCatalog() : null,
      readJsonDetailed(paths.providers), readJsonDetailed(paths.pluginProviders),
    ])
    for (const result of [providers, pluginProviders]) {
      if (!result.ok && !result.missing) requestRetry("model-metadata")
    }
    return resolveCapabilityMappings({
      ids, catalog: cat, existing, exported: descriptors,
      providers: providers.ok ? providers.value : null,
      pluginProviders: pluginProviders.ok ? pluginProviders.value : [],
      metadataUnavailable: [providers, pluginProviders].some(result => !result.ok && !result.missing),
      previous: state.modelCapabilities?.slug === String(opts.connectionSlug) ? state.modelCapabilities : null,
      overrides: opts.modelCapabilityRefs, officialProviders: opts.officialProviders,
    })
  }

  const reportCapabilities = async (plan, applied) => {
    capabilitiesForRound = { applied, entries: plan.entries }
    for (const entry of plan.entries) {
      if (entry.status !== "matched" || entry.warnings.length) warnOnce(
        `capability:${JSON.stringify(entry)}`,
        `model ${entry.id}: ${entry.status}; ${entry.reference ? `reference ${entry.reference} (${entry.source})` : "no automatic reference; set modelCapabilityRefs if needed"}` +
          (entry.warnings.length ? `; ${entry.warnings.join(", ")}` : "") + "; details: open Ducoro sync diagnostics",
      )
    }
  }

  const stageCapabilities = async (plan) => {
    if (!dryRun) {
      state.modelCapabilities = {
        ...(state.modelCapabilities?.slug === String(opts.connectionSlug) ? state.modelCapabilities : {}),
        slug: String(opts.connectionSlug), pending: { refs: plan.refs, provenance: plan.provenance },
      }
      await saveState()
    }
    await reportCapabilities(plan, false)
  }

  const commitCapabilities = async (plan) => {
    const next = { slug: String(opts.connectionSlug), ...plan.provenance }
    if (!dryRun && JSON.stringify(state.modelCapabilities) !== JSON.stringify(next)) {
      state.modelCapabilities = next
      await saveState()
    }
    await reportCapabilities(plan, true)
  }

  const modelSync = createModelSync({ operations,
    opts: { ...opts, dryRun }, run, getState: () => state, save: saveState,
    requestRetry: (...args) => requestRetry(...args), log,
    isCurrent: () => !stopped && !activeGatewayController?.signal.aborted,
    onStatus: (status, details) => diagnostics.stage("models", status, details),
  })

  // -------------------------------------------------------- connection

  const getConnection = async (slug) => {
    const r = await run(["connections", "get", slug], { timeoutMs: 30_000 })
    if (r.ok) {
      const connection = r.json?.connection ?? r.json
      if (dryRun || (connection && typeof connection === "object" && !Array.isArray(connection))) return connection
      throw new Error("connections get returned an unknown response")
    }
    if (isNotFound(r)) return null
    throw new Error(`connections get ${slug} failed: ${errMsg(r)}`)
  }

  const connectionArgs = (want) => {
    const a = []
    if (want.model) a.push("--model", want.model)
    if (want.models.length) a.push("--models", want.models.join(","))
    const refs = Object.entries(want.refs)
    a.push("--capability-refs", refs.map(([k, v]) => `${k}=${v}`).join(","))
    return a
  }

  const createConnection = async (slug, want, key) => {
    const r = await run(
      [
        "connections", "add-apikey", "custom-openai-compat",
        "--slug", slug,
        "--name", want.name,
        "--base-url", want.baseUrl,
        ...connectionArgs(want),
        "--stdin",
      ],
      { stdin: key },
    )
    if (!r.ok) {
      log(`creating connection ${slug} failed (kept for retry): ${errMsg(r)}`)
      requestRetry("gateway-sync")
      return false
    }
    log(`connection ${slug} created -> ${want.baseUrl}${want.model ? ` (model ${want.model})` : ""}`)
    return true
  }

  const updateConnection = async (slug, want, key) => {
    const r = await run(
      [
        "connections", "update-apikey", slug,
        "--name", want.name,
        "--base-url", want.baseUrl,
        ...connectionArgs(want),
        "--stdin",
      ],
      { stdin: key },
    )
    if (!r.ok) {
      log(`updating connection ${slug} failed (kept for retry): ${errMsg(r)}`)
      requestRetry("gateway-sync")
      return false
    }
    log(`connection ${slug} updated -> ${want.baseUrl}${want.model ? ` (model ${want.model})` : ""}`)
    return true
  }

  const syncConnection = async ({ gwUrl, gwV1, key, model, models, descriptors }) => {
    const slug = String(opts.connectionSlug)
    if (model && models.length && !models.includes(model)) {
      log("selected model is absent from Magpie's export; keeping the connection and Bots for retry")
      requestRetry("gateway-model-catalog")
      return
    }
    const cur = await getConnection(slug)
    const capabilityPlan = await refsFor(models, cur?.modelCapabilityRefs, descriptors)
    const want = {
      name: String(opts.connectionName),
      baseUrl: gwV1,
      model,
      models,
      refs: capabilityPlan.refs,
    }
    const keyHash = sha256(key)

    if (!cur) {
      await stageCapabilities(capabilityPlan)
      if (await createConnection(slug, want, key)) {
        state.connection = { slug, keyHash, baseUrl: want.baseUrl, model: want.model }
        await saveState()
        if (dryRun) return
        const saved = await getConnection(slug)
        if (saved && str(saved.baseUrl) === want.baseUrl && str(saved.defaultModel) === want.model && sameSet(saved.models, want.models)
          && sameObj(saved.modelCapabilityRefs, want.refs)) {
          await commitCapabilities(capabilityPlan)
          await modelSync.sync({ ...saved, slug })
          return true
        } else throw new Error("created connection readback differs; Bot sync deferred")
      }
      return
    }

    if (!state.connection || state.connection.slug !== slug) {
      // A profile with this slug exists but this plugin did not create it.
      // Adopt it only when it already points at this gateway; never touch a
      // stranger's route.
      if (str(cur.baseUrl) === want.baseUrl) {
        log(`adopting existing connection ${slug}`)
        state.connection = { slug, keyHash, baseUrl: want.baseUrl, model: str(cur.defaultModel) }
      } else {
        warnOnce(
          `conn:${slug}`,
          `connection "${slug}" exists and was not created by this plugin; ` +
            `pick another connectionSlug option to let the bridge create its own`,
        )
        return
      }
    }

    await modelSync.prepare(slug, model, str(cur.defaultModel))
    const changed =
      state.connection.keyHash !== keyHash ||
      str(cur.baseUrl) !== want.baseUrl ||
      str(cur.defaultModel) !== want.model ||
      !sameSet(cur.models, want.models) ||
      !sameObj(cur.modelCapabilityRefs, want.refs)
    if (changed) await stageCapabilities(capabilityPlan)
    if (changed && !await updateConnection(slug, want, key)) return
    if (changed) {
      state.connection = { slug, keyHash, baseUrl: want.baseUrl, model: want.model }
      await saveState()
    }
    // Reconcile even when the route is unchanged: this also repairs stale Bot
    // IDs left by 0.3.0 or retries a Bot update after a connection write succeeded.
    const saved = changed ? await getConnection(slug) : cur
    if (saved && str(saved.baseUrl) === want.baseUrl && str(saved.defaultModel) === want.model && sameSet(saved.models, want.models)
      && sameObj(saved.modelCapabilityRefs, want.refs)) {
      await commitCapabilities(capabilityPlan)
      await modelSync.sync({ ...saved, slug })
      return true
    } else throw new Error("saved connection readback differs; Bot sync deferred")
  }

  const removeConnection = async () => {
    const slug = state.connection?.slug
    if (!slug) return
    const r = await run(["connections", "rm", slug], { timeoutMs: 30_000 })
    if (r.ok || isNotFound(r)) {
      log(`connection ${slug} removed`)
      state.connection = null
      await saveState()
    } else {
      log(`removing connection ${slug} failed: ${errMsg(r)}`)
      requestRetry("gateway-sync")
    }
  }

  // --------------------------------------------------------------- mcp

  const listMcpSlugs = async (scope) => {
    const r = await run(mcpCommand(scope, "list"), { timeoutMs: 30_000 })
    if (!r.ok) {
      log(`mcp list (${scope}) failed: ${errMsg(r)}`)
      requestRetry("mcp-sync")
      return null
    }
    const arr = Array.isArray(r.json?.servers) ? r.json.servers : Array.isArray(r.json) ? r.json : null
    if (!arr) {
      if (dryRun) return new Map()
      log("mcp list returned an unknown response; resource changes postponed")
      requestRetry("mcp-sync")
      return null
    }
    return new Map(arr.filter((s) => str(s?.slug)).map((s) => [s.slug, s]))
  }

  // ducoro-cli cannot carry commas inside single-use --env/--header/--args
  // flags; comma-bearing values move into the encrypted credential store and
  // are referenced as {{credentials.slug}}.
  const materializeSecrets = async (def) => {
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
            : await run(["credentials", "put", "--slug", cslug, "--kind", "mcp_credential", "--stdin"], {
                stdin: v,
                timeoutMs: 30_000,
              })
          if (!r.ok) return null
          out.push([k, `{{credentials.${cslug}}}`])
          def.credentialRefs.push(cslug)
        } else {
          out.push([k, v])
        }
      }
      return out
    }
    if (def.env?.length) {
      const env = await conv(def.env, "env")
      if (!env) return false
      def.env = env
    }
    if (def.headers?.length) {
      const headers = await conv(def.headers, "hdr")
      if (!headers) return false
      def.headers = headers
    }
    return true
  }

  const mcpServerArgs = (def, patch = false) => {
    const a = []
    if (def.transport === "stdio") {
      a.push("--command", def.command)
      if (patch || def.args?.length) a.push("--args", (def.args ?? []).join(","))
      if (patch || def.env?.length) a.push("--env", (def.env ?? []).map(([k, v]) => `${k}=${v}`).join(","))
      if (patch) a.push("--url", "", "--header", "")
    } else {
      a.push("--url", def.url)
      if (patch || def.headers?.length) a.push("--header", (def.headers ?? []).map(([k, v]) => `${k}=${v}`).join(","))
      if (patch) a.push("--command", "", "--args", "", "--env", "")
    }
    for (const ref of def.credentialRefs ?? []) a.push("--credential-ref", ref)
    if (patch && !def.credentialRefs?.length) a.push("--credential-ref", "")
    if (patch || def.disabledTools?.length) a.push("--tool-deny", (def.disabledTools ?? []).join(","))
    return a
  }

  const addMcpServer = async (scope, def) =>
    run(
      mcpCommand(scope, "add", "--slug", def.slug, "--name", def.name, "--transport", def.transport, ...mcpServerArgs(def)),
      { timeoutMs: 60_000 },
    )

  const updateMcpServer = async (scope, slug, def) =>
    run(
      mcpCommand(scope, "update", slug, "--name", def.name, "--transport", def.transport, ...mcpServerArgs(def, true)),
      { timeoutMs: 60_000 },
    )

  const probeMcp = async (scope, slug, roundId) => {
    const r = await run(mcpCommand(scope, "probe", slug, "--timeout-ms", "15000"), { timeoutMs: 30_000 })
    if (r.ok) {
      const tools = r.json?.tools
      const n = Array.isArray(tools) ? tools.length : typeof r.json?.toolsCount === "number" ? r.json.toolsCount : null
      log(`mcp ${slug} probe ok${n != null ? ` (${n} tools)` : ""}`)
    } else {
      log(`mcp ${slug} probe failed: ${errMsg(r)}`)
      if (diagnostics.isCurrent(roundId)) requestRetry("mcp-probe")
    }
    await diagnostics.probeResult(roundId, r.ok)
    return r.ok
  }

  const selected = (items) => items.filter((item) =>
    item && item.offHere !== true && item.disabled !== true && item.enabled !== false &&
    Array.isArray(item.agents) && item.agents.includes("ducoro"))

  const loadLibrary = async () => {
    const lib = await readJson(paths.library)
    if (!lib || (lib.mcp != null && !Array.isArray(lib.mcp)) || (lib.skills != null && !Array.isArray(lib.skills))) {
      throw new Error(`cannot read valid Magpie selections at ${paths.library}; will retry`)
    }
    return { ...lib, mcp: lib.mcp ?? [], skills: lib.skills ?? [] }
  }

  const desiredMcpServers = async (library) => {
    const wanted = new Map()
    if (opts.syncLibraryMcp) {
      const exported = await readJson(paths.mcp)
      const lib = parseLibMcp(exported)
      for (const server of selected(library.mcp)) {
        const name = str(server.name)
        if (!name) continue
        const slug = mcpSlug(name, String(opts.mcpPrefix))
        // Keep the access decision separate from definition preparation. A
        // broken export, missing variable or unsupported argument is retryable,
        // not evidence that the user revoked this server.
        wanted.set(slug, null)
        if (!exported && Object.values(state.mcp).some(mine => mine?.slug === slug)) {
          log(`MCP server "${name}" kept while its export is unreadable; will retry`)
          requestRetry("mcp-sync")
          continue
        }
        // A routed export only contains "magpie". Ducoro needs an individual
        // definition to show each selected server and its real tool catalog.
        // Prefer an individual export (Magpie may have added an auth proxy),
        // otherwise use that selected server's original library definition.
        const direct = lib[name]
        let def = direct ?? { ...server, type: server.transport }
        if (direct?.url && /\/mcp\/magpie\/hub(?:\/|$)/.test(direct.url)) {
          def = { ...server, type: server.transport }
        }
        if (def.disabled === true || def.enabled === false) {
          wanted.delete(slug)
          continue
        }
        try {
          const expand = (value) => typeof value === "string" ? value.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_match, key) => {
            if (process.env[key] === undefined) throw new Error(`missing environment variable ${key}`)
            return process.env[key]
          }) : value
          def = {
            ...def,
            command: expand(def.command), url: expand(def.url),
            args: Array.isArray(def.args) ? def.args.map(expand) : def.args,
            env: Object.fromEntries(Object.entries(def.env ?? {}).map(([k, v]) => [k, expand(v)])),
            headers: Object.fromEntries(Object.entries(def.headers ?? {}).map(([k, v]) => [k, expand(v)])),
          }
        } catch (e) {
          log(`MCP server "${name}" skipped: ${e.message}`)
          requestRetry("mcp-sync")
          continue
        }
        const mapped = mapServer(name, def, String(opts.mcpPrefix))
        if (!mapped) {
          warnOnce(`mcp:${name}`, `cannot map MCP server "${name}" to a ducoro definition; skipped`)
          requestRetry("mcp-sync")
          continue
        }
        if (mapped.transport === "stdio" && (mapped.args ?? []).some((a) => a.includes(","))) {
          warnOnce(
            `mcp:${name}:args`,
            `MCP server "${name}" skipped: one of its arguments contains a comma, ` +
              `which ducoro-cli's single-use --args flag cannot represent`,
          )
          requestRetry("mcp-sync")
          continue
        }
        mapped.disabledTools = Array.isArray(server.disabledTools) ? server.disabledTools.map(String) : []
        wanted.set(mapped.slug, mapped)
      }
    }
    return wanted
  }

  const pendingMcpProbes = new Map()
  let forceMcpProbe = false
  let authorizedMcpSlugs = new Set()
  let probeDrain = null
  const drainMcpProbes = () => {
    if (probeDrain) return probeDrain
    probeDrain = (async () => {
      while (pendingMcpProbes.size) {
        const [id, { scope, slug, roundId }] = pendingMcpProbes.entries().next().value
        pendingMcpProbes.delete(id)
        if (authorizedMcpSlugs.has(id)) await probeMcp(scope, slug, roundId)
      }
    })().finally(() => { probeDrain = null })
    return probeDrain
  }

  const migrateMcpOwnership = async () => {
    let changed = false
    for (const [id, mine] of Object.entries(state.mcp)) {
      if (typeof mine === "string") {
        state.mcp[`global:${id}`] = { scope: "global", slug: id, hash: mine }
        delete state.mcp[id]
        changed = true
      } else if (!mine || !["global"].includes(mine.scope) && !/^agt-[A-Za-z0-9-]+$/.test(mine.scope ?? "") ||
        typeof mine.slug !== "string" || id !== `${mine.scope}:${mine.slug}`) {
        throw new Error("invalid MCP ownership state; scope changes postponed")
      }
    }
    if (changed) await saveState()
  }

  const syncMcp = async (library) => {
    await migrateMcpOwnership()
    const wanted = new Map()
    for (const scope of resourcePlan.mcpScopes) {
      const definitions = await desiredMcpServers(scopedLibrary(library, opts, "mcp", scope))
      for (const [slug, def] of definitions) wanted.set(`${scope}:${slug}`, { scope, slug, def })
    }
    authorizedMcpSlugs = new Set(wanted.keys())
    const scopes = new Set([...resourcePlan.mcpScopes, ...Object.values(state.mcp).map(mine => mine.scope)])
    const current = new Map()
    for (const scope of scopes) current.set(scope, await listMcpSlugs(scope))

    // Apply every known revocation before additions. On a scope switch, a
    // failed old-layer cleanup must not be described as successful isolation.
    let revocationFailed = false
    for (const [id, mine] of Object.entries(state.mcp)) {
      if (wanted.has(id)) continue
      pendingMcpProbes.delete(id)
      if (!current.get(mine.scope)) { revocationFailed = true; continue }
      const r = await run(mcpCommand(mine.scope, "rm", mine.slug), { timeoutMs: 30_000 })
      if (r.ok || isNotFound(r)) {
        delete state.mcp[id]
        await saveState()
        log(`removed MCP server ${mine.slug} (${mine.scope}; no longer selected)`)
      } else {
        log(`removing MCP server ${mine.slug} (${mine.scope}) failed: ${errMsg(r)}`)
        requestRetry("mcp-sync")
        revocationFailed = true
      }
    }
    if (revocationFailed) return

    for (const [id, { scope, slug, def: source }] of wanted) {
      if (watching && pending) return
      const layer = current.get(scope)
      if (!source || !layer) continue
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
      const operation = await operations.begin('mcp',scope,slug,hash,['revoke-mcp'])
      if (!operation) continue
      if (changed && !(await materializeSecrets(def))) {
        await operations.finish(operation,false)
        log(`mcp ${slug} (${scope}) skipped: could not store its credential`)
        requestRetry("mcp-sync")
        continue
      }
      if (changed) {
        const r = layer.has(slug) ? await updateMcpServer(scope, slug, def) : await addMcpServer(scope, def)
        if (r.ok) {
          state.mcp[id] = { scope, slug, hash, sourceName: source.name }
          await operations.finish(operation)
          await saveState()
          pendingMcpProbes.set(id, { scope, slug, roundId: diagnostics.token() })
        } else {
          await operations.finish(operation,false)
          log(`saving MCP server ${slug} (${scope}) failed (kept for retry): ${errMsg(r)}`)
          requestRetry("mcp-sync")
        }
      } else {
        await operations.finish(operation)
        if (forceMcpProbe || layer.get(slug)?.connectionStatus !== "connected")
        pendingMcpProbes.set(id, { scope, slug, roundId: diagnostics.token() })
      }
    }
  }

  // ------------------------------------------------------------ skills

  // Keep only paths and the small manifest in memory. A scan hashes one file
  // at a time; staging is needed only for a changed bundle. Watches invalidate
  // the cache, while explicit/periodic reconciliations still hash all bytes.
  const activeSkillRoots = new Set()
  const skillBundleCache = new Map()
  let skillCacheGeneration = 0
  const invalidateSkillCache = () => { skillCacheGeneration++; skillBundleCache.clear(); clearFileCache() }

  const readBundle = async (source) => {
    const root = await realpath(source)
    const files = []
    const walk = async (dir, rel = "", parents = new Set()) => {
      const resolved = await realpath(dir)
      if (resolved !== root && !resolved.startsWith(root + "/")) throw new Error("skill link escapes its bundle")
      if (parents.has(resolved)) throw new Error("cyclic skill link")
      const ancestors = new Set([...parents, resolved])
      for (const e of await readdir(dir, { withFileTypes: true })) {
        if (e.name === ".DS_Store" || e.name === ".git") continue
        const path = join(dir, e.name)
        const target = await realpath(path)
        if (target !== root && !target.startsWith(root + "/")) throw new Error("skill link escapes its bundle")
        const info = await stat(path)
        const name = rel ? `${rel}/${e.name}` : e.name
        if (info.isDirectory()) await walk(path, name, ancestors)
        else if (info.isFile()) files.push({ name, path, mode: info.mode & 0o777 })
        else throw new Error(`unsupported skill entry: ${name}`)
      }
    }
    await walk(root)
    files.sort((a, b) => a.name.localeCompare(b.name))
    const manifest = files.find((f) => f.name === "SKILL.md")
    if (!manifest) throw new Error("SKILL.md missing")
    const md = compatibleSkillMarkdown((await readCachedFile(manifest.path)).toString("utf8"), new Set(files.map((f) => f.name)))
    const hash = createHash("sha256")
    for (const f of files) {
      const bytes = f.name === "SKILL.md" ? Buffer.from(md) : await readCachedFile(f.path)
      hash.update(JSON.stringify([f.name, bytes.length, f.mode])).update(bytes)
    }
    return { files, md, hash: hash.digest("hex") }
  }

  const artifacts = createSkillArtifacts(join(stateDir, "skill-artifacts"), readBundle)

  const skillCommand = (scope, action, ...args) => scope === "global"
    ? ["skill", action, ...args]
    : ["agent", "skill", action, scope, ...args]

  const skillNames = async (scope) => {
    const r = await run(skillCommand(scope, "list"), { timeoutMs: 30_000 })
    if (!r.ok) {
      log(`skill list (${scope}) failed: ${errMsg(r)}`)
      requestRetry("skill-list")
      return null
    }
    if (dryRun && !r.json) return new Set()
    const raw = r.json
    const arr = Array.isArray(raw) ? raw : raw?.skills ?? raw?.data
    if (!Array.isArray(arr)) { requestRetry("skill-list"); return null }
    return new Set(arr.map((s) => typeof s === "string" ? s : str(s?.name) || str(s?.slug)).filter(Boolean))
  }

  const listSkillBundles = async (library) => {
    const found = new Map()
    const candidates = []
    activeSkillRoots.clear()
    for (const item of selected(library.skills)) {
      const sourceName = str(item.name)
      if (!sourceName || basename(sourceName) !== sourceName || sourceName === "." || sourceName === "..") continue
      let dir = null
      for (const path of [join(paths.skills, sourceName), join(paths.librarySkills, sourceName)]) {
        if ((await stat(path).catch(() => null))?.isDirectory()) { dir = path; break }
      }
      if (!dir) {
        log(`selected skill ${sourceName} has no readable bundle; will retry`)
        requestRetry("skill-source")
        found.set(sourceName, { sourceName })
        continue
      }
      try {
        const root = await realpath(dir)
        activeSkillRoots.add(root)
        candidates.push({ sourceName, dir, root })
      } catch (e) {
        log(`selected skill ${sourceName} cannot be resolved: ${e.message}`)
        requestRetry("skill-source")
        found.set(sourceName, { sourceName })
      }
    }
    // Discover all roots before refreshing so one source cannot retire the
    // next source's watcher while this round is still scanning its bytes.
    if (watching) await refreshWatches()
    for (const { sourceName, dir, root } of candidates) {
      try {
        const generation = skillCacheGeneration
        const bundle = (watching && skillBundleCache.get(root)) || await readBundle(dir)
        if (watching && generation === skillCacheGeneration) skillBundleCache.set(root, bundle)
        const name = skillName(bundle.md, sourceName)
        if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)) throw new Error("invalid skill manifest name")
        if (found.has(name)) throw new Error(`duplicate skill manifest name ${name}`)
        found.set(name, { sourceName, dir, ...bundle })
      } catch (e) {
        log(`selected skill ${sourceName} cannot be prepared: ${e.message}`)
        requestRetry("skill-source")
        found.set(sourceName, { sourceName })
      }
    }
    for (const root of skillBundleCache.keys()) if (!activeSkillRoots.has(root)) skillBundleCache.delete(root)
    return found
  }

  const removeNamedSkill = async (scope, name) => {
    const r = await run(skillCommand(scope, "remove", name), { timeoutMs: 30_000 })
    if (r.ok || isNotFound(r)) return true
    log(`removing skill ${name} failed: ${errMsg(r)}`)
    requestRetry("skill-cleanup")
    return false
  }

  const removeSkill = async (id, mine) => {
    // A cancelled assignment also owns its interrupted replacement backup.
    // Retain the transaction until both names have been removed successfully.
    if (!(await removeNamedSkill(mine.scope, mine.name))) return false
    if (mine.replacement && !(await removeNamedSkill(mine.scope, mine.replacement.backupName))) return false
    delete state.skills[id]
    await saveState()
    log(`removed skill ${mine.name} (${mine.scope})`)
    return true
  }

  const pruneSkills = async (library) => {
    let complete = true
    const sourceNames = new Map(resourcePlan.skillScopes.map(scope => [scope,
      new Set(selected(scopedLibrary(library, opts, "skills", scope).skills).map(item => str(item.name))),
    ]))
    for (const [id, mine] of Object.entries(state.skills)) {
      if (!mine.scope) {
        delete state.skills[id]
        state.skills[`global:${id}`] = { ...mine, scope: "global", name: id, sourceName: id }
      }
    }
    for (const [id, mine] of Object.entries(state.skills)) {
      if (!sourceNames.get(mine.scope)?.has(mine.sourceName) && !(await removeSkill(id, mine))) complete = false
    }
    if (![...sourceNames.values()].some(names => names.size)) { activeSkillRoots.clear(); invalidateSkillCache() }
    return complete
  }

  // import refuses an existing valid target. Rename the complete old bundle
  // instead of deleting it, and journal the backup in the existing owner entry
  // before touching Ducoro. The journal survives app/CLI host restarts.
  const recoverSkillReplacement = async (id, mine, existing) => {
    const tx = mine.replacement
    if (!tx) return true
    const hasOriginal = existing.has(mine.name)
    const hasBackup = existing.has(tx.backupName)
    if (hasOriginal && tx.phase === "installed") {
      if (hasBackup && !(await removeNamedSkill(mine.scope, tx.backupName))) return false
      existing.delete(tx.backupName)
      delete mine.replacement
      await saveState()
      return true
    }
    if (hasBackup) {
      if (hasOriginal) {
        // An import completed just before the process exited. Both identities
        // are recorded by this transaction; commit the valid listed candidate.
        mine.hash = tx.nextHash
        tx.phase = "installed"
        await saveState()
        return recoverSkillReplacement(id, mine, existing)
      }
      const restored = await run(skillCommand(mine.scope, "rename", tx.backupName, "--to", mine.name), { timeoutMs: 30_000 })
      if (!restored.ok) {
        log(`restoring previous skill ${mine.name} failed; backup retained: ${errMsg(restored)}`)
        requestRetry("skill-restore")
        return false
      }
      existing.delete(tx.backupName)
      existing.add(mine.name)
      mine.hash = tx.previousHash
    } else if (!hasOriginal) {
      log(`skill ${mine.name} replacement is incomplete; ownership retained for retry`)
      requestRetry("skill-restore")
      return false
    }
    delete mine.replacement
    await saveState()
    return true
  }

  const syncSkills = async (library) => {
    if (!(await pruneSkills(library))) return
    const bundles = opts.syncSkills ? await listSkillBundles(library) : new Map()
    if (!bundles.size) return
    for (const scope of resourcePlan.skillScopes) {
      const sourceNames = new Set(selected(scopedLibrary(library, opts, "skills", scope).skills).map(item => str(item.name)))
      if (roundSkillPaths && !Object.values(state.skills).some(row => row.scope === scope && row.replacement) &&
          ![...bundles.values()].some(bundle => sourceNames.has(bundle.sourceName) && bundle.dir && [...roundSkillPaths].some(path => path === bundle.dir || path.startsWith(bundle.dir + '/') || bundle.dir.startsWith(path + '/')))) continue
      const existing = await skillNames(scope)
      if (!existing) continue
      for (const [id, mine] of Object.entries(state.skills)) {
        if (mine.scope === scope && mine.replacement) await recoverSkillReplacement(id, mine, existing)
      }
      for (const [name, bundle] of bundles) {
        if (watching && pending) return
        if (!sourceNames.has(bundle.sourceName)) continue
        if (!bundle.dir) continue
        const { dir, hash, sourceName } = bundle
        const id = `${scope}:${name}`
        let mine = state.skills[id]
        if (mine?.replacement) continue
        if (existing.has(name) && !mine) {
          warnOnce(`skill:${id}`, `skill "${name}" exists in Ducoro (${scope}) and was not imported by this plugin; skipped`)
          requestRetry("skill-conflict")
          continue
        }
        if (mine?.hash === hash && existing.has(name)) { const op=await operations.begin('skills',scope,name,hash,['revoke-skills']); await operations.finish(op); continue }
        const operation = await operations.begin('skills', scope, name, hash, ['revoke-skills'])
        if (!operation) continue
        try {
          const staged = await artifacts.prepare(name, bundle)
          if (mine && existing.has(name)) {
            let suffix = 0
            let backupName
            do { backupName = `magpie-backup-${sha256(id + hash).slice(0, 16)}${suffix ? `-${suffix}` : ""}`; suffix++ } while (existing.has(backupName))
            mine.replacement = { backupName, previousHash: mine.hash, nextHash: hash, phase: "prepared" }
            await saveState()
            const backup = await run(skillCommand(scope, "rename", name, "--to", backupName), { timeoutMs: 30_000 })
            if (!backup.ok) {
              log(`backing up skill ${name} failed; update deferred: ${errMsg(backup)}`)
              requestRetry("skill-backup")
              await operations.finish(operation, false)
              continue
            }
            existing.delete(name)
            existing.add(backupName)
            mine.replacement.phase = "backed-up"
            await saveState()
          }
          const r = await run(skillCommand(scope, "import", staged), { timeoutMs: 60_000 })
          if (r.ok) {
            existing.add(name)
            state.skills[id] = { scope, name, sourceName, hash, dir, ...(mine?.replacement ? { replacement: { ...mine.replacement, phase: "installed" } } : {}) }
            mine = state.skills[id]
            await saveState()
            if (mine.replacement) await recoverSkillReplacement(id, mine, existing)
            // A manifest rename should retire its old identity only after the
            // replacement has successfully reached Ducoro.
            for (const [oldId, old] of Object.entries(state.skills)) {
              if (oldId !== id && old.scope === scope && old.sourceName === sourceName) await removeSkill(oldId, old)
            }
            await operations.finish(operation, !mine.replacement)
            log(`skill ${name} imported (${scope})`)
          } else {
            log(`importing skill ${name} failed; restoring previous version: ${errMsg(r)}`)
            await operations.finish(operation, false)
            requestRetry("skill-import")
            if (mine?.replacement) await recoverSkillReplacement(id, mine, existing)
          }
        } catch (e) {
          invalidateSkillCache()
          log(`preparing skill ${name} failed; existing import retained: ${e.message}`)
          await operations.finish(operation, false)
          requestRetry("skill-stage")
        }
      }
    }
  }

  // -------------------------------------------------------------- flow

  let disconnectNoted = false
  let gatewayMissingSince = null

  const syncGateway = async (reason = "tick") => {
    const controller = new AbortController()
    activeGatewayController = controller
    try {
      const result = await readJsonDetailed(paths.bridge)
      let f = result.value
      if (!result.ok) {
        if (result.missing && state.connection) {
          gatewayMissingSince ??= Date.now()
          if (Date.now() - gatewayMissingSince >= 250) f = {}
        } else if (result.missing) f = {}
        if (!f) {
          log("gateway configuration temporarily unreadable; keeping the connection")
          requestRetry("gateway-unreadable")
          return
        }
      } else gatewayMissingSince = null
      const plain = (value) => value && typeof value === "object" && !Array.isArray(value)
      const gateway = f?.gateway === undefined ? {} : f.gateway
      // A valid empty object is Magpie's restored/disconnected configuration.
      // Malformed or half-written gateway values are not a disconnect signal.
      const valid = plain(f) && plain(gateway) && ["url", "v1", "key"].every((key) =>
        gateway[key] === undefined || typeof gateway[key] === "string")
      const gwUrl = str(gateway?.url)
      const key = str(gateway?.key)
      if (!valid || Boolean(gwUrl) !== Boolean(key)) {
        log("gateway configuration incomplete; keeping the connection")
        requestRetry("gateway-unreadable")
        return
      }
      rememberSecret(key)
      if (result.ok && !dryRun) {
        const info = await stat(paths.bridge).catch(() => null)
        if (info && (info.mode & 0o777) !== 0o600) await chmod(paths.bridge, 0o600).catch(() => {})
      }
  
      const gwV1 = str(gateway.v1) || (gwUrl ? gwUrl.replace(/\/+$/, "") + "/v1" : "")
      const model = normalizeModel(f?.model)
      const models = modelIds(f?.models)
      const connected = Boolean(gwUrl && key)
  
      if (!connected) {
        await handleDisconnected()
        diagnostics.stage("connection", "skipped")
        diagnostics.stage("models", "skipped")
      } else disconnectNoted = false
  
      log(`sync (${reason}): gateway ${gwUrl}, model ${model ?? "—"}, ${models.length} model(s)`)
  
      if (connected && opts.syncConnection) {
        const configured = await syncConnection({ gwUrl, gwV1, key, model, models, descriptors: f?.models })
        diagnostics.stage("connection", configured ? "configured" : "pending")
      }
    } catch (e) {
      if (e?.code !== "GATEWAY_SUPERSEDED") {
        log("connection sync error:", e?.message ?? e)
        requestRetry("gateway-sync")
      }
    } finally {
      if (activeGatewayController === controller) activeGatewayController = null
    }
  }

  const syncTotal = createTotalSync({ operations, opts: { ...opts, dryRun }, paths, run, save: saveState, getState: () => state, requestRetry: (...args) => requestRetry(...args), log })

  let resourcePlan = null
  const resolveResourcePlan = async () => {
    validateResourceOptions(opts)
    let bots = []
    if (needsResourceTargets(opts)) {
      const response = await run(["agent", "list"], { timeoutMs: 30_000 })
      if (!response.ok) throw new Error("cannot list resource target Bots; existing resources retained")
      bots = Array.isArray(response.json) ? response.json : response.json?.agents ?? response.json?.bots
      if (!Array.isArray(bots)) {
        if (dryRun) bots = []
        else throw new Error("unrecognized resource target Bot list; existing resources retained")
      }
    }
    const plan = planResourceScopes(opts, bots)
    if (needsResourceTargets(opts) && !plan.targets.length) {
      log("no pi-agent Bots are bound to the Magpie connection for resource sync")
      requestRetry("resource-targets")
    }
    return plan
  }

  let dirtySkillPaths = new Set()
  let roundSkillPaths = null
  let dirtyFeatures = new Set()
  let roundFeatures = null
  const wants = feature => !roundFeatures || roundFeatures.has(feature)
  const classifyChange = path => {
    if (path === paths.instructions) return ['total']
    if (path === paths.mcp) return ['mcp']
    if ([paths.bridge,paths.providers,paths.pluginProviders].includes(path)) return ['gateway']
    if ([paths.skills,paths.librarySkills,...activeSkillRoots].some(root => path === root || path.startsWith(root + '/'))) return ['skills']
    return ['all']
  }
  const syncAllUnlocked = async (reason = "tick") => {
    forceMcpProbe = reason === "page-retry"
    try { await loadState() }
    catch (error) {
      diagnostics.retry(error.code)
      log(error.message)
      requestRetry(error.code)
      return
    }
    const invalidOptions = [...validateOptions(rawOptions), ...validateOptions(opts)]
    if (invalidOptions.length) {
      // Invalid access selections must never fall through to an inherited or
      // global resource plan. Diagnostics remain in memory for this round.
      log("invalid plugin options:", invalidOptions.map(item => `${item.field}:${item.code}`).join(", "))
      requestRetry("options-invalid")
      return
    }
    // Resource-library assignment is independent of the model connection.
    // Never keep a deselected resource because onDisconnect=keep/prune=false.
    let library
    try {
      library = await loadLibrary()
    } catch (e) {
      log(e.message)
      requestRetry("library-unreadable")
    }
    if (library) {
      resourcePlan = null
      try { resourcePlan = await resolveResourcePlan() } catch (e) {
        log("resource scope planning failed:", e?.message ?? e)
        requestRetry("resource-targets")
      }
      if (resourcePlan) {
        for (const issue of findUnavailableAssignments(library, opts, resourcePlan)) {
          diagnostics.retry("resource-selection-unavailable", [issue.kind], [issue.scope])
        }
      }
      // Revocations run before additions, large bundle reads, or gateway work.
      try { if (resourcePlan && wants("skills")) await progress.step("revoke-skills", () => pruneSkills(library)) } catch (e) {
        log("skill cleanup error:", e?.message ?? e)
        requestRetry("skill-cleanup")
      }
      try {
        if (resourcePlan && wants("mcp")) {
          await progress.step("mcp", () => syncMcp(opts.syncMcp ? library : { ...library, mcp: [] }))
          diagnostics.stage("mcp", "configured", { targets: resourcePlan.mcpScopes, count: Object.keys(state.mcp).length })
        }
      } catch (e) {
        log("mcp sync error:", e?.message ?? e)
        requestRetry("mcp-sync")
      }
      try { if (wants("total")) totalForRound = await progress.step("instructions-subagents", () => syncTotal(library)) } catch (e) {
        log("Total sync error:", e?.message ?? e)
        requestRetry("total-sync")
      }
      try {
        if (resourcePlan && wants("skills")) {
          await progress.step("skills", () => syncSkills(library))
          diagnostics.stage("skills", "configured", { targets: resourcePlan.skillScopes, count: Object.keys(state.skills).length })
        }
      } catch (e) {
        log("skill sync error:", e?.message ?? e)
        requestRetry("skill-sync")
      }
    }
    try {
      if (wants("accounts")) await progress.step("accounts", () => syncAccountConnectors({ options: opts, state, run, save: saveState, operations }))
    } catch (error) {
      log("account connector synchronization pending:", error.message)
      diagnostics.retry("account-connectors", ["mcp"])
      requestRetry("account-connectors")
    }
    if (wants("gateway") && !stopped && (!watching || !pending)) await progress.step("models", () => syncGateway(reason))
  }

  // Magpie CLI commands start their own plugin hosts while the app's host
  // stays alive. Serialize their writes and reload ownership each round so
  // an older host cannot overwrite another host's newly imported skills.
  let syncing = false
  const syncAll = async (reason = "tick") => {
    if (syncing || stopped) return false
    syncing = true
    if (!watching || reason === "interval" || reason === "startup" || reason === "page-retry") invalidateSkillCache()
    const lock = join(stateDir, "sync.lock")
    let locked = false
    try {
      if (!dryRun) {
        await mkdir(stateDir, { recursive: true })
        try {
          await mkdir(lock)
        } catch (e) {
          if (e.code !== "EEXIST") throw e
          const owner = await readJson(join(lock, "owner.json"))
          let stale = false
          if (Number.isInteger(owner?.pid) && owner.pid > 0) {
            try { process.kill(owner.pid, 0) } catch (err) { stale = err.code === "ESRCH" }
          } else {
            const info = await stat(lock).catch(() => null)
            stale = info && Date.now() - info.mtimeMs > 60_000
          }
          if (!stale) return false
          await rm(lock, { recursive: true, force: true })
          await mkdir(lock)
        }
        locked = true
        await writeFile(join(lock, "owner.json"), JSON.stringify({ pid: process.pid }))
      }
      const changes = dirtyFeatures; dirtyFeatures = new Set()
      const skillPaths = dirtySkillPaths; dirtySkillPaths = new Set()
      roundFeatures = (reason.startsWith('retry:') || ['file-change','coalesced','page-retry-failed'].includes(reason)) && changes.size && !changes.has('all') ? changes : null
      roundSkillPaths = roundFeatures && skillPaths.size ? skillPaths : null
      retryRequested = false
      artifacts.reset()
      operations.reset(reason.startsWith('retry:') || reason === 'page-retry-failed')
      stateLoaded = false
      state = { v: 2, connection: null, mcp: {}, skills: {} }
      progress.begin(reason, { ...run.metrics(), ...fileMetrics, ...artifacts.metrics() })
      diagnostics.begin(reason, roundFeatures)
      if (!roundFeatures) { totalForRound = null; capabilitiesForRound = null }
      try {
        await syncAllUnlocked(reason)
      } catch (error) {
        diagnostics.retry("sync-failed")
        await diagnostics.complete({ state, total: totalForRound, capabilities: capabilitiesForRound })
        throw error
      }
      if (pending) {
        for (const feature of roundFeatures ?? ['all']) dirtyFeatures.add(feature)
        for (const path of roundSkillPaths ?? []) dirtySkillPaths.add(path)
      }
      if (!dryRun && stateLoaded) { if (!roundFeatures && !pending && !retryRequested) await operations.retire(null); await maintainLocalRecords(stateDir,state,saveState); await compactManagedState(stateFile) }
      await diagnostics.complete({ state, total: totalForRound, capabilities: capabilitiesForRound })
      return true
    } finally {
      if (locked) await rm(lock, { recursive: true, force: true })
      progress.end({ ...run.metrics(), ...fileMetrics, ...artifacts.metrics() })
      syncing = false
      // Probing remote servers must not hold the mutation lock or delay a
      // subsequent Library event. Manual syncs still wait for their diagnostics.
      if (watching) {
        if (!pending) void drainMcpProbes().catch((e) => { log("mcp probe error:", e?.message ?? e); requestRetry("mcp-probe") })
        void refreshWatches()
      } else await drainMcpProbes()
    }
  }

  const handleDisconnected = async () => {
    if (!state.connection) return
    if (opts.onDisconnect === "remove") {
      log("model disconnected; removing the bridge connection")
      await removeConnection()
    } else if (!disconnectNoted) {
      disconnectNoted = true
      log("model disconnected; connection kept (onDisconnect=keep)")
    }
  }

  // ------------------------------------------------------------ start

  let watching = false
  let stopped = false
  let lifecycleGeneration = 0
  let running = false
  let pending = false
  let syncTimer = null
  let retryTimer = null
  let interval = null
  let watchFallback = null
  let watchDegraded = false
  let activeRun = null
  let retryDelay = 250
  let retryRequested = false
  let refreshPromise = null
  let refreshAgain = false
  const watchers = new Map()

  const requestRetry = (reason) => {
    progress.fail()
    // Diagnostics also cover manual one-shot runs, where no retry timer runs.
    // Total's per-resource report provides finer attribution than its shared
    // retry signal; use that report rather than marking both resources failed.
    if (reason !== "total-resource") diagnostics.retry(reason)
    const feature = reason.startsWith('skill') ? 'skills' : reason.startsWith('mcp') ? 'mcp' : reason.startsWith('total') ? 'total' : reason.startsWith('account') ? 'accounts' : /model|connection|gateway/.test(reason) ? 'gateway' : 'all'
    dirtyFeatures.add(feature)
    retryRequested = true
    if (!watching) return
    if (retryTimer) return
    retryTimer = setTimeout(() => {
      retryTimer = null
      trigger(`retry:${reason}`, 0)
    }, retryDelay)
    retryDelay = Math.min(5_000, retryDelay * 2)
  }

  // A bounded batch window, not a trailing debounce: continuous filesystem
  // writes cannot postpone a user's selection indefinitely.
  const trigger = (reason = "file-change", delay = 75) => {
    if (!watching) return
    if (reason === 'page-retry-failed') {
      const map = {models:'gateway',connection:'gateway',mcp:'mcp',skills:'skills',instructions:'total',subagents:'total'}
      const report = diagnostics.read({syncing,watchDegraded})
      for(const [key,value] of Object.entries(report.features ?? {})) if(value.status==='pending') dirtyFeatures.add(map[key] ?? 'all')
      if(report.issues?.some(issue => issue.code?.includes('account')))dirtyFeatures.add('accounts')
      if(!dirtyFeatures.size)return
    } else if (!reason.startsWith("retry:") && !["file-change","coalesced"].includes(reason)) dirtyFeatures.add("all")
    if (reason === "file-change" || reason === "watch-fallback") interruptGatewayReads()
    if (running) { pending = true; return }
    if (syncTimer) return
    syncTimer = setTimeout(() => {
      syncTimer = null
      running = true
      retryRequested = false
      activeRun = (async () => {
        try {
          if (await syncAll(reason) === false) requestRetry("host-lock")
          if (!retryRequested) {
            retryDelay = 250
            clearTimeout(retryTimer)
            retryTimer = null
          }
        } catch (e) {
          log("sync failed:", e?.message ?? e)
          requestRetry("sync-failed")
        } finally {
          running = false
          if (pending && watching) {
            pending = false
            trigger("coalesced", 0)
          }
        }
      })()
    }, delay)
  }

  const refreshWatches = () => {
    if (!watching) return Promise.resolve()
    if (refreshPromise) { refreshAgain = true; return refreshPromise }
    refreshPromise = (async () => {
      do {
        refreshAgain = false
        const desired = new Map()
        const add = (dir, recursive = false, name = null, info = null) => {
          const entry = desired.get(dir) ?? { recursive: false, names: new Set(), info }
          entry.recursive ||= recursive
          if (name) entry.names.add(name)
          if (info) entry.info = info
          desired.set(dir, entry)
        }
        // Anchor a missing directory at its nearest existing ancestor. When
        // Magpie creates it, attach the real watcher during the same event.
        const observe = async (target, recursive, name = null) => {
          let dir = target, child = name
          let info = await stat(dir).catch(() => null)
          while (!info?.isDirectory() && dirname(dir) !== dir) {
            child = basename(dir)
            dir = dirname(dir)
            info = await stat(dir).catch(() => null)
          }
          if (info?.isDirectory()) add(await realpath(dir), dir === target && recursive, child, info)
        }
        for (const file of [paths.bridge, paths.mcp, paths.library, paths.instructions, paths.providers, paths.pluginProviders]) {
          await observe(dirname(file), false, basename(file))
          await observe(dirname(dirname(file)), false, basename(dirname(file)))
        }
        const roots = new Set([paths.skills, paths.librarySkills, ...activeSkillRoots])
        for (const dir of roots) {
          await observe(dir, true)
          await observe(dirname(dir), false, basename(dir))
        }
        // A recursive root already covers its physical subdirectories.
        for (const dir of [...desired.keys()]) {
          if ([...desired].some(([parent, entry]) => parent !== dir && entry.recursive && dir.startsWith(parent + "/"))) desired.delete(dir)
        }
        if (!watching) break
        watchDegraded = false
        for (const [dir, entry] of watchers) {
          const want = desired.get(dir)
          if (!want || want.recursive !== entry.recursive || want.info?.ino !== entry.ino || want.info?.dev !== entry.dev) {
            entry.watcher.close()
            watchers.delete(dir)
          } else entry.names = want.names
        }
        for (const [dir, want] of desired) {
          if (watchers.has(dir)) continue
          try {
            const entry = { ...want, ino: want.info?.ino, dev: want.info?.dev }
            const watcher = fsWatch(dir, { recursive: want.recursive }, (_event, filename) => {
              const name = filename == null ? null : String(filename).split(/[\\/]/)[0]
              if (!entry.recursive && name && !entry.names.has(name)) return
              const changedPath = filename == null ? dir : join(dir,String(filename))
              if (_event === 'change' && Object.values(paths).some(path => dirname(path) === changedPath)) { void refreshWatches(); return }
              const features = classifyChange(changedPath)
              for (const feature of features) dirtyFeatures.add(feature)
              if (features.includes('all')) invalidateSkillCache()
              else if (features.includes('skills')) {
                dirtySkillPaths.add(changedPath)
                skillCacheGeneration++
                for (const root of skillBundleCache.keys()) if (changedPath === root || changedPath.startsWith(root + '/') || root.startsWith(changedPath + '/')) skillBundleCache.delete(root)
              }
              trigger("file-change")
              void refreshWatches()
            })
            entry.watcher = watcher
            watcher.on("error", (error) => {
              watchDegraded = true
              warnOnce(`watch:${dir}:${error?.code}`, `watch error (${error?.code ?? "unknown"}): ${dir}; using short reconciliation fallback`)
              watcher.close()
              if (watchers.get(dir) === entry) watchers.delete(dir)
              diagnostics.retry("watch-error")
            })
            watchers.set(dir, entry)
          } catch { watchDegraded = true; diagnostics.retry("watch-missing") }
        }
      } while (refreshAgain && watching)
    })().catch((e) => {
      log("watch refresh failed:", e?.message ?? e)
      diagnostics.retry("watch-refresh")
    }).finally(() => { refreshPromise = null })
    return refreshPromise
  }

  let pageService = null
  const start = async () => {
    if (watching) return
    const generation = ++lifecycleGeneration
    stopped = false
    // Watch callbacks use canonical directories; source paths must use the same
    // spelling (macOS /var and /private/var otherwise classify every event as full).
    for (const [key,path] of Object.entries(paths)) paths[key] = await realpath(path).catch(async () => join(await realpath(dirname(path)).catch(() => dirname(path)),basename(path)))
    watching = true
    if (!dryRun) await removeLegacyReports(stateDir)
    if (!dryRun) pageService = await createPageService({ options: rawOptions, paths, stateDir, run, trigger, getProgress: () => progress.read(),
    getReport: () => diagnostics.read({ syncing, watchDegraded }),
      getModelCatalog: async force => ({ ...(await capabilityCatalog.snapshot(force)), entries: (capabilitiesForRound?.entries ?? []).map(({id,status,source,reference,commonCapabilities,warnings}) => ({id,status,source,reference,commonCapabilities,warnings})) }), log })
    await refreshWatches()
    if (!watching || generation !== lifecycleGeneration) return
    trigger("startup", 0)
    // Watch failures (OS limits, unsupported recursive watch) must not silently
    // turn resource changes into a two-minute wait. This path is normally idle.
    let fallbackRequired = false
    const poll = createFallbackPoll({
      fingerprint: () => sourceFingerprint([paths.bridge,paths.mcp,paths.library,paths.instructions,paths.providers,paths.pluginProviders,paths.skills,paths.librarySkills,...activeSkillRoots]),
      refresh: () => refreshWatches(),
      changed: () => { if (fallbackRequired) { invalidateSkillCache(); trigger("watch-fallback", 0) } },
    })
    await poll()
    if (!watching || generation !== lifecycleGeneration) return
    const checkFallback = async () => {
      if (!watching || generation !== lifecycleGeneration) return
      let delay = 1000
      try { fallbackRequired = watchDegraded; delay = await poll() } catch { /* Next scan retries without interrupting gateway reads. */ }
      if (watching && generation === lifecycleGeneration) {
        watchFallback = setTimeout(checkFallback, watchDegraded ? delay : 30000)
        watchFallback.unref?.()
      }
    }
    watchFallback = setTimeout(checkFallback, 1000)
    watchFallback.unref?.()
    interval = setInterval(() => {
      void refreshWatches()
      trigger("interval", 0)
    }, Math.max(30_000, Number(opts.intervalMs) || DEFAULTS.intervalMs))
    interval.unref?.()
    log(`bridge started (state: ${stateFile}, dry-run: ${dryRun})`)
  }

  const stop = async () => {
    lifecycleGeneration++
    await pageService?.close()
    pageService = null
    stopped = true
    watching = false
    interruptGatewayReads()
    authorizedMcpSlugs.clear()
    pendingMcpProbes.clear()
    pending = false
    clearTimeout(syncTimer)
    clearTimeout(retryTimer)
    clearInterval(interval)
    clearTimeout(watchFallback)
    syncTimer = retryTimer = interval = null
    for (const { watcher } of watchers.values()) watcher.close()
    watchers.clear()
    await refreshPromise
    await activeRun
    await drainMcpProbes()
  }

  return {
    opts, paths, stateFile, start, stop, syncAll, trigger, drainMcpProbes,
    getProgress: () => progress.read(),
    getReport: () => diagnostics.read({ syncing, watchDegraded }),
    get state() { return state },
    get currentResourceTargets() { return resourcePlan ? [...resourcePlan.targets] : null },
    get watchedPaths() { return [...watchers.keys()] },
  }

}

// ---------------------------------------------------------------- plugin

const DucoroBridge = async (input, options) => {
  const engine = createEngine(input, options)
  await engine.start()
  return {}
}

export default { id: "magpie-ducoro", server: DucoroBridge }

export const _internal = {
  createEngine,
  DEFAULTS,
  DEFAULT_PATHS,
  sha256,
  slugify,
  str,
  normalizeModel,
  modelIds,
  parseLibMcp,
  mapServer,
  defHash,
  skillName,
  compatibleSkillMarkdown,
  sameSet,
  sameObj,
}

// ------------------------------------------------------------ self-test

// bun bridge.mjs --selftest   (paths via DUCORO_BRIDGE_FILE / _MCP_FILE /
// _SKILLS_DIR / _STATE_DIR; runs one syncAll in dry-run unless
// DUCORO_BRIDGE_LIVE=1)
if (
  import.meta.main ||
  (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
) {
  const live = process.env.DUCORO_BRIDGE_LIVE === "1"
  const engine = createEngine(
    {},
    {
      dryRun: !live,
      ...(process.env.DUCORO_BRIDGE_OPTS ? JSON.parse(process.env.DUCORO_BRIDGE_OPTS) : {}),
    },
  )
  let synced = false
  for (let attempt = 0; attempt < 40; attempt++) {
    if (await engine.syncAll("selftest")) { synced = true; break }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  if (!synced) {
    console.error("[ducoro-bridge] another host is syncing; selftest not run")
    process.exit(1)
  }
  console.log("[ducoro-bridge] selftest done")
  process.exit(0)
}
