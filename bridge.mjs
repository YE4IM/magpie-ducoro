// Ducoro connector bridge — the main plugin module of magpie-ducoro.
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

import { chmod, readFile, realpath, rm, stat } from "node:fs/promises"
import { homedir } from "node:os"
import { basename, dirname, join } from "node:path"
import { pathToFileURL } from "node:url"

import { syncAccountConnectors } from "./lib/account-connectors.mjs"
import { createConnectionSync } from "./lib/bridge-connection.mjs"
import { createCreationReconciler } from "./lib/bridge-creations.mjs"
import { createBridgeLogger } from "./lib/bridge-logger.mjs"
import { createMcpSync } from "./lib/bridge-mcp.mjs"
import { createScheduler } from "./lib/bridge-scheduler.mjs"
import { createSkillSync } from "./lib/bridge-skills.mjs"
import { createWatchManager } from "./lib/bridge-watch.mjs"
import { withCommandRecovery } from "./lib/command-recovery.mjs"
import { createCommandRunner } from "./lib/command-runner.mjs"
import { DEFAULTS } from "./lib/defaults.mjs"
import { createDiagnostics, removeLegacyReports } from "./lib/diagnostics.mjs"
import { fileMetrics } from "./lib/file-cache.mjs"
import { validateLibrary } from "./lib/library-schema.mjs"
import { maintainLocalRecords } from "./lib/local-records.mjs"
import { createCapabilityCatalog } from "./lib/model-capabilities.mjs"
import { createModelSync } from "./lib/model-sync.mjs"
import { readOperationControls } from "./lib/operation-controls.mjs"
import { createOperationRetries } from "./lib/operation-retries.mjs"
import { createOperationStore } from "./lib/operation-store.mjs"
import { validateOptions } from "./lib/options.mjs"
import { createPageService } from "./lib/page-service.mjs"
import { within } from "./lib/path-safety.mjs"
import { createProgress, createReadCoordinator } from "./lib/performance.mjs"
import * as Plans from "./lib/plan-rules.mjs"
import { desiredResources } from "./lib/resource-plan.mjs"
import {
  findUnavailableAssignments,
  needsResourceTargets,
  planResourceScopes,
  validateResourceOptions,
} from "./lib/resource-scopes.mjs"
import { readManagedState, saveManagedState } from "./lib/state-store.mjs"
import { acquireSyncLock } from "./lib/sync-lock.mjs"
import { syncResources } from "./lib/sync-resources.mjs"
import { createTotalSync } from "./lib/total.mjs"
import { isPlainObject, trimmedString as str } from "./lib/utils.mjs"
import { createFallbackPoll, sourceFingerprint } from "./lib/watch-fallback.mjs"

export { DEFAULTS }

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

const emptyState = () => ({ v: 2, connection: null, mcp: {}, skills: {} })

// ---------------------------------------------------------------- helpers

const normalizeModel = (model) => {
  if (!model) return null
  if (typeof model === "string") return model.trim() || null
  if (typeof model === "object") return str(model.id) || null
  return null
}

// magpie hands `models` to connect() in the same shape as `model`; accept
// arrays of objects/strings and plain id-keyed objects alike.
const modelIds = (models) => {
  if (Array.isArray(models)) {
    return models
      .map((m) => (typeof m === "string" ? m : str(m?.id)))
      .filter(Boolean)
  }
  if (models && typeof models === "object") return Object.keys(models).filter(Boolean)
  return []
}

// ---------------------------------------------------------------- engine

const createEngine = (input = {}, options = {}) => {
  const opts = { ...DEFAULTS }
  const merge = (o) => {
    if (isPlainObject(o)) {
      for (const [k, v] of Object.entries(o)) {
        if (v !== undefined && k in DEFAULTS) opts[k] = v
      }
    }
  }
  merge(options)
  merge(input?.magpie?.options)
  merge(input?.magpie?.option)

  const rawOptions = structuredClone(opts)
  if (!validateOptions(opts).length) Object.assign(opts, Plans.resolve(opts))
  const initialInvalidOptions = [...validateOptions(rawOptions), ...validateOptions(opts)]
  const progress = createProgress()
  const dryRun = opts.dryRun === true || opts.dryRun === "true"
  const runtimeOpts = { ...opts, dryRun }

  const configDir =
    str(input?.directory) ||
    str(input?.worktree) ||
    join(pathFromEnv("XDG_CONFIG_HOME", join(HOME, ".config")), "magpie")
  const paths = {
    bridge: pathFromEnv("DUCORO_BRIDGE_FILE", DEFAULT_PATHS.bridge),
    mcp: pathFromEnv("DUCORO_BRIDGE_MCP_FILE", DEFAULT_PATHS.mcp),
    skills: pathFromEnv("DUCORO_BRIDGE_SKILLS_DIR", DEFAULT_PATHS.skills),
    library: pathFromEnv("DUCORO_BRIDGE_LIBRARY_FILE", join(configDir, "library.json")),
    librarySkills: pathFromEnv(
      "DUCORO_BRIDGE_LIBRARY_SKILLS_DIR",
      join(configDir, "library", "skills"),
    ),
    providers: pathFromEnv("DUCORO_BRIDGE_PROVIDERS_FILE", join(configDir, "providers.json")),
    pluginProviders: pathFromEnv(
      "DUCORO_BRIDGE_PLUGIN_PROVIDERS_FILE",
      join(configDir, "plugin-providers.json"),
    ),
    instructions: pathFromEnv(
      "DUCORO_BRIDGE_INSTRUCTIONS_FILE",
      join(HOME, ".ducoro", "magpie-instructions.md"),
    ),
    ducoroHome: pathFromEnv("DUCORO_BRIDGE_DUCORO_HOME", join(HOME, ".ducoro")),
  }
  const stateDir = pathFromEnv("DUCORO_BRIDGE_STATE_DIR", join(configDir, "ducoro-bridge"))
  const stateFile = join(stateDir, "state.json")

  const diagnostics = createDiagnostics({ options: opts })
  const logger = createBridgeLogger({ diagnostics })
  const { rememberSecret, log, warnOnce, errMsg, isNotFound } = logger

  let totalForRound = null
  let capabilitiesForRound = null
  let watching = false
  let stopped = false
  let lifecycleGeneration = 0
  let interval = null
  let watchFallback = null
  let wakeFallback = () => {}
  let watchDegraded = false
  let checkingFallback = false
  let pageService = null
  let dirtySkillPaths = new Set()
  let roundSkillPaths = null
  let dirtyFeatures = new Set()
  let roundFeatures = null
  let syncing = false
  let disconnectNoted = false
  let gatewayMissingSince = null
  let activeGatewayController = null
  let resourcePlan = null
  let desiredPlan = null

  const gatewayAbortError = () =>
    Object.assign(new Error("gateway sync superseded by a resource change"), {
      name: "AbortError",
      code: "GATEWAY_SUPERSEDED",
    })
  const interruptGatewayReads = () => activeGatewayController?.abort()

  const manualRetries = createOperationRetries()
  let roundRetries = null

  const scheduler = createScheduler({
    diagnostics,
    progress,
    manualRetries,
    syncAll: (reason) => syncAll(reason),
    interruptGatewayReads,
    log,
    isWatching: () => watching,
    onDirtyFeature: (feature) => dirtyFeatures.add(feature),
  })
  const { requestRetry, trigger } = scheduler

  // ------------------------------------------------------------- state

  let state = emptyState()
  let stateLoaded = false

  const loadState = async () => {
    if (stateLoaded) return
    const loaded = await readManagedState(stateFile)
    state = loaded.state
    stateLoaded = true
  }

  const saveState = async (savePaths) => {
    if (dryRun) return
    try {
      // The store captures values now and serializes durable writes itself.
      await saveManagedState(stateFile, state, { paths: savePaths })
    } catch (e) {
      log("cannot save state:", e?.message ?? e)
      throw e
    }
  }

  const operations = createOperationStore({
    getState: () => state,
    save: saveState,
    onDefer: (ms) => requestRetry("operation-backoff", ms),
  })

  // --------------------------------------------------------------- cli

  const run = createReadCoordinator(
    withCommandRecovery(
      createCommandRunner({
        opts,
        dryRun,
        rememberSecret,
        log,
        getGatewaySignal: () => activeGatewayController?.signal,
        gatewayAbortError,
      }),
    ),
  )

  const readJsonDetailed = async (path) => {
    try {
      return { ok: true, value: JSON.parse(await readFile(path, "utf8")) }
    } catch (e) {
      return { ok: false, missing: e.code === "ENOENT", error: e }
    }
  }

  const readJson = async (path) => {
    const result = await readJsonDetailed(path)
    return result.ok ? result.value : null
  }

  const loadLibrary = async () => {
    const result = await readJsonDetailed(paths.library)
    if (!result.ok) {
      throw new Error(`cannot read valid Magpie selections at ${paths.library}; will retry`, {
        cause: result.error,
      })
    }
    try {
      validateLibrary(result.value)
    } catch (cause) {
      throw new Error(`cannot read valid Magpie selections at ${paths.library}; will retry`, {
        cause,
      })
    }
    return { ...result.value, mcp: result.value.mcp ?? [], skills: result.value.skills ?? [] }
  }

  // ---------------------------------------------------------- adapters

  const capabilityCatalog = createCapabilityCatalog({ run, log })
  const modelSync = createModelSync({
    operations,
    opts: runtimeOpts,
    run,
    getState: () => state,
    save: saveState,
    requestRetry,
    log,
    isCurrent: () => !stopped && !activeGatewayController?.signal.aborted,
    onStatus: (status, details) => diagnostics.stage("models", status, details),
  })

  const { syncConnection, removeConnection } = createConnectionSync({
    opts,
    dryRun,
    paths,
    run,
    getState: () => state,
    saveState,
    requestRetry,
    log,
    warnOnce,
    errMsg,
    isNotFound,
    modelSync,
    capabilityCatalog,
    diagnostics,
    readJsonDetailed,
    setCapabilitiesForRound: (value) => { capabilitiesForRound = value },
  })

  const isSuperseded = () => watching && scheduler.isPending()

  const creations = createCreationReconciler({
    paths,
    run,
    getState: () => state,
    saveState,
    listMcpSlugs: (...args) => mcp.listMcpSlugs(...args),
    skillNames: (...args) => skills.skillNames(...args),
    skillCommand: (...args) => skills.skillCommand(...args),
    log,
    requestRetry,
  })

  const mcp = createMcpSync({
    dryRun,
    run,
    getState: () => state,
    saveState,
    operations,
    diagnostics,
    requestRetry,
    log,
    warnOnce,
    errMsg,
    isNotFound,
    isSuperseded,
    reconcileCreations: (kind) => creations.reconcileCreations(kind),
  })

  const classifyChange = (path) => {
    if (path === paths.instructions) return ["total"]
    if (path === paths.mcp) return ["mcp"]
    if ([paths.bridge, paths.providers, paths.pluginProviders].includes(path)) return ["gateway"]
    if ([paths.skills, paths.librarySkills, ...skills.activeSkillRoots()].some((root) => within(root, path))) {
      return ["skills"]
    }
    return ["all"]
  }

  const watchManager = createWatchManager({
    paths,
    getActiveSkillRoots: () => skills.activeSkillRoots(),
    classifyChange,
    onFilesChanged: (changedPath, features) => {
      for (const feature of features) dirtyFeatures.add(feature)
      if (features.includes("all")) skills.invalidateSkillCache()
      else if (features.includes("skills")) {
        dirtySkillPaths.add(changedPath)
        skills.handleSkillChange(changedPath)
      }
    },
    onDegradedChange: (degraded) => {
      const wasDegraded = watchDegraded
      watchDegraded = degraded
      if (degraded && !wasDegraded && !checkingFallback) wakeFallback()
    },
    onWatchEvent: () => trigger("file-change"),
    diagnostics,
    warnOnce,
    log,
    isWatching: () => watching,
  })

  const skills = createSkillSync({
    opts,
    dryRun,
    paths,
    stateDir,
    run,
    getState: () => state,
    saveState,
    operations,
    diagnostics,
    requestRetry,
    log,
    warnOnce,
    errMsg,
    isNotFound,
    isWatching: () => watching,
    isSuperseded,
    refreshWatches: () => watchManager.refreshWatches(),
    reconcileCreations: (kind) => creations.reconcileCreations(kind),
  })

  const syncTotal = createTotalSync({
    operations,
    opts: runtimeOpts,
    paths,
    run,
    save: saveState,
    getState: () => state,
    requestRetry,
    log,
  })

  // -------------------------------------------------------------- flow

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
        } else if (result.missing) {
          f = {}
        }
        if (!f) {
          log("gateway configuration temporarily unreadable; keeping the connection")
          requestRetry("gateway-unreadable")
          return
        }
      } else {
        gatewayMissingSince = null
      }
      const gateway = f?.gateway === undefined ? {} : f.gateway
      // A valid empty object is Magpie's restored/disconnected configuration.
      // Malformed or half-written gateway values are not a disconnect signal.
      const valid =
        isPlainObject(f) &&
        isPlainObject(gateway) &&
        ["url", "v1", "key"].every(
          (key) => gateway[key] === undefined || typeof gateway[key] === "string",
        )
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
        if (info && (info.mode & 0o777) !== 0o600) {
          await chmod(paths.bridge, 0o600).catch((e) =>
            log(`could not tighten permissions on ${paths.bridge}: ${e?.message ?? e}`),
          )
        }
      }

      const gwV1 = str(gateway.v1) || (gwUrl ? gwUrl.replace(/\/+$/, "") + "/v1" : "")
      const model = normalizeModel(f?.model)
      const models = modelIds(f?.models)
      const connected = Boolean(gwUrl && key)

      if (!connected) {
        await handleDisconnected()
        diagnostics.stage("connection", "skipped")
        diagnostics.stage("models", "skipped")
      } else {
        disconnectNoted = false
      }

      log(`sync (${reason}): gateway ${gwUrl}, model ${model ?? "—"}, ${models.length} model(s)`)

      if (connected && opts.syncConnection) {
        const configured = await syncConnection({
          gwV1,
          key,
          model,
          models,
          descriptors: f?.models,
        })
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

  const resolveResourcePlan = async () => {
    validateResourceOptions(opts)
    const needsTargets = needsResourceTargets(opts)
    let bots = []
    if (needsTargets) {
      const response = await run(["agent", "list"], { timeoutMs: 30_000 })
      if (!response.ok) throw new Error("cannot list resource target Bots; existing resources retained")
      bots = Array.isArray(response.json)
        ? response.json
        : response.json?.agents ?? response.json?.bots
      if (!Array.isArray(bots)) {
        if (dryRun) bots = []
        else throw new Error("unrecognized resource target Bot list; existing resources retained")
      }
    }
    const plan = planResourceScopes(opts, bots)
    if (needsTargets && !plan.targets.length) {
      log("no pi-agent Bots are bound to the Magpie connection for resource sync")
      requestRetry("resource-targets")
    }
    return plan
  }

  const wants = (feature) => !roundFeatures || roundFeatures.has(feature)
  const metricsSnapshot = () => ({ ...run.metrics(), ...fileMetrics, ...skills.metrics() })

  const syncAllUnlocked = async (reason = "tick") => {
    mcp.setForceProbe(reason === "page-retry")
    try {
      await loadState()
    } catch (error) {
      diagnostics.retry(error.code)
      log(error.message)
      requestRetry(error.code)
      return
    }
    const controls = await readOperationControls(stateDir)
    roundRetries = manualRetries.take(state.operations)
    if (roundRetries.size) roundSkillPaths = null
    operations.reset({ controls, retryIds: roundRetries })
    if (initialInvalidOptions.length) {
      // Invalid access selections must never fall through to an inherited or
      // global resource plan. Diagnostics remain in memory for this round.
      log(
        "invalid plugin options:",
        initialInvalidOptions.map((item) => `${item.field}:${item.code}`).join(", "),
      )
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
      desiredPlan = null
      try {
        resourcePlan = await resolveResourcePlan()
      } catch (e) {
        log("resource scope planning failed:", e?.message ?? e)
        requestRetry("resource-targets")
      }
      if (resourcePlan) {
        const exported = await readJson(paths.mcp)
        desiredPlan = desiredResources({
          library,
          options: opts,
          scopes: resourcePlan,
          exported,
          exportReadable: Boolean(exported),
          state,
          env: process.env,
        })
        for (const issue of findUnavailableAssignments(library, opts, resourcePlan)) {
          diagnostics.retry("resource-selection-unavailable", [issue.kind], [issue.scope])
        }
      }
      await syncResources({
        library,
        resourcePlan,
        wants,
        progress,
        pruneSkills: (lib) => skills.pruneSkills(lib, { resourcePlan, desiredPlan }),
        syncMcp: () => mcp.syncMcp({ resourcePlan, desiredPlan }),
        syncTotal,
        syncSkills: (lib) => skills.syncSkills(lib, { resourcePlan, desiredPlan, roundSkillPaths }),
        diagnostics,
        state,
        opts,
        requestRetry,
        log,
        setTotal: (value) => { totalForRound = value },
      })
    }
    try {
      if (wants("accounts")) {
        await progress.step("accounts", () =>
          syncAccountConnectors({ options: opts, state, run, save: saveState, operations }),
        )
      }
    } catch (error) {
      log("account connector synchronization pending:", error.message)
      diagnostics.retry("account-connectors", ["mcp"])
      requestRetry("account-connectors")
    }
    if (wants("gateway") && !stopped && (!watching || !scheduler.isPending())) {
      await progress.step("models", () => syncGateway(reason))
    }
  }

  // Magpie CLI commands start their own plugin hosts while the app's host
  // stays alive. Serialize their writes and reload ownership each round so
  // an older host cannot overwrite another host's newly imported skills.
  const syncAll = async (reason = "tick") => {
    if (stopped) return false
    manualRetries.add(reason)
    if (syncing) return false
    syncing = true
    if (!watching || ["interval", "startup", "page-retry"].includes(reason)) {
      skills.invalidateSkillCache()
    }
    let releaseLock
    try {
      if (!dryRun) {
        releaseLock = await acquireSyncLock(stateDir, { recover: true })
        if (!releaseLock) return false
      }
      const reviewFile = join(stateDir, "restore-review.json")
      try {
        const review = JSON.parse(await readFile(reviewFile, "utf8"))
        if (!review.approved) {
          log("Restored management records await preview and manual synchronization")
          return true
        }
        await rm(reviewFile)
      } catch (error) {
        if (error.code !== "ENOENT") throw error
      }
      const changes = dirtyFeatures
      dirtyFeatures = new Set()
      const skillPaths = dirtySkillPaths
      dirtySkillPaths = new Set()
      const scopedReason =
        reason.startsWith("retry:") ||
        ["file-change", "coalesced", "page-retry-failed"].includes(reason) ||
        reason.startsWith("page-operation:")
      roundFeatures = scopedReason && changes.size && !changes.has("all") ? changes : null
      roundSkillPaths = roundFeatures && skillPaths.size ? skillPaths : null
      scheduler.consumeRetryRequested()
      mcp.invalidateListCache()
      skills.resetRound()
      roundRetries = null
      stateLoaded = false
      state = emptyState()
      progress.begin(reason, metricsSnapshot())
      diagnostics.begin(reason, roundFeatures)
      if (!roundFeatures) {
        totalForRound = null
        capabilitiesForRound = null
      }
      try {
        await syncAllUnlocked(reason)
      } catch (error) {
        diagnostics.retry("sync-failed")
        await diagnostics.complete({ state, total: totalForRound, capabilities: capabilitiesForRound })
        throw error
      }
      if (scheduler.isPending()) {
        for (const feature of roundFeatures ?? ["all"]) dirtyFeatures.add(feature)
        for (const path of roundSkillPaths ?? []) dirtySkillPaths.add(path)
      }
      if (!dryRun && stateLoaded) {
        if (!roundFeatures && !scheduler.isPending() && !scheduler.wasRetryRequested()) {
          await operations.retire(null)
        }
        await maintainLocalRecords(stateDir, state, saveState)
      }
      await diagnostics.complete({ state, total: totalForRound, capabilities: capabilitiesForRound })
      return true
    } finally {
      // A superseding source event can defer a resource before begin() runs.
      // Carry those requests into the next round; new clicks stay in the queue.
      if (roundRetries) manualRetries.restore(operations.remainingRetries())
      roundRetries = null
      try {
        if (releaseLock) await releaseLock()
      } finally {
        try {
          progress.end(metricsSnapshot())
        } finally {
          syncing = false
        }
      }
      // Probing remote servers must not hold the mutation lock or delay a
      // subsequent Library event. Manual syncs still wait for their diagnostics.
      if (watching) {
        if (!scheduler.isPending()) {
          void mcp.drainMcpProbes().catch((e) => {
            log("mcp probe error:", e?.message ?? e)
            requestRetry("mcp-probe")
          })
        }
        void watchManager.refreshWatches()
      } else {
        await mcp.drainMcpProbes()
      }
    }
  }

  // ------------------------------------------------------------ start

  const getProgress = () => progress.read()
  const getReport = () => diagnostics.read({ syncing, watchDegraded })
  const getModelCatalog = async (force) => ({
    ...(await capabilityCatalog.snapshot(force)),
    entriesUpdatedAt: capabilitiesForRound?.updatedAt ?? null,
    entriesRoundId: capabilitiesForRound?.roundId ?? null,
    syncing,
    entries: (capabilitiesForRound?.entries ?? []).map(
      ({ id, status, source, reference, commonCapabilities, warnings }) => ({
        id,
        status,
        source,
        reference,
        commonCapabilities,
        warnings,
      }),
    ),
  })

  const start = async () => {
    if (watching) return
    const generation = ++lifecycleGeneration
    stopped = false
    // Watch callbacks use canonical directories; source paths must use the same
    // spelling (macOS /var and /private/var otherwise classify every event as full).
    await Promise.all(
      Object.entries(paths).map(async ([key, path]) => {
        paths[key] = await realpath(path).catch(async () =>
          join(await realpath(dirname(path)).catch(() => dirname(path)), basename(path)),
        )
      }),
    )
    watching = true
    try {
      if (!dryRun) await removeLegacyReports(stateDir)
      if (!dryRun) {
        pageService = await createPageService({
          options: rawOptions,
          paths,
          stateDir,
          run,
          trigger,
          getProgress,
          getReport,
          getModelCatalog,
          log,
        })
      }
      await watchManager.refreshWatches()
      if (!watching || generation !== lifecycleGeneration) return
      trigger("startup", 0)
      // Watch failures (OS limits, unsupported recursive watch) must not silently
      // turn resource changes into a two-minute wait. This path is normally idle.
      let fallbackRequired = false
      const poll = createFallbackPoll({
        fingerprint: () =>
          sourceFingerprint([
            paths.bridge,
            paths.mcp,
            paths.library,
            paths.instructions,
            paths.providers,
            paths.pluginProviders,
            paths.skills,
            paths.librarySkills,
            ...skills.activeSkillRoots(),
          ]),
        refresh: () => watchManager.refreshWatches(),
        changed: () => {
          if (fallbackRequired) {
            skills.invalidateSkillCache()
            trigger("watch-fallback", 0)
          }
        },
      })
      await poll()
      if (!watching || generation !== lifecycleGeneration) return
      const checkFallback = async () => {
        if (!watching || generation !== lifecycleGeneration || checkingFallback) return
        clearTimeout(watchFallback)
        watchFallback = null
        checkingFallback = true
        let delay = 1000
        try {
          fallbackRequired = watchDegraded
          delay = await poll()
        } catch (e) {
          log("watch fallback scan deferred:", e?.message ?? e)
        } finally {
          checkingFallback = false
        }
        if (watching && generation === lifecycleGeneration) {
          clearTimeout(watchFallback)
          watchFallback = setTimeout(checkFallback, watchDegraded ? delay : 300000)
          watchFallback.unref?.()
        }
      }
      wakeFallback = () => {
        if (!watching || generation !== lifecycleGeneration || checkingFallback) return
        clearTimeout(watchFallback)
        watchFallback = setTimeout(checkFallback, 0)
        watchFallback.unref?.()
      }
      watchFallback = setTimeout(checkFallback, 1000)
      watchFallback.unref?.()
      interval = setInterval(() => {
        void watchManager.refreshWatches()
        trigger("interval", 0)
      }, Math.max(30_000, Number(opts.intervalMs) || DEFAULTS.intervalMs))
      interval.unref?.()
      log(`bridge started (state: ${stateFile}, dry-run: ${dryRun})`)
    } catch (error) {
      await stop()
      throw error
    }
  }

  const stop = async () => {
    lifecycleGeneration++
    stopped = true
    watching = false
    scheduler.clearTimers()
    clearInterval(interval)
    clearTimeout(watchFallback)
    interval = watchFallback = null
    interruptGatewayReads()
    watchManager.closeAll()
    const svc = pageService
    pageService = null
    await svc?.close()
    await watchManager.waitForRefresh()
    await scheduler.waitForActiveRun()
    mcp.clearProbes()
    await mcp.drainMcpProbes()
    scheduler.reset()
    wakeFallback = () => {}
    watchDegraded = false
    checkingFallback = false
    dirtyFeatures.clear()
    dirtySkillPaths.clear()
    roundFeatures = null
    roundSkillPaths = null
    logger.clearWarned()
    manualRetries.clear()
    disconnectNoted = false
    gatewayMissingSince = null
  }

  return {
    opts,
    paths,
    stateFile,
    start,
    stop,
    syncAll,
    trigger,
    drainMcpProbes: mcp.drainMcpProbes,
    getProgress,
    getReport,
    get state() { return state },
    get currentResourceTargets() { return resourcePlan ? [...resourcePlan.targets] : null },
    get watchedPaths() { return watchManager.watchedPaths() },
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
}

// ------------------------------------------------------------ self-test

// node bridge.mjs   (paths via DUCORO_BRIDGE_FILE / _MCP_FILE /
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
    if (await engine.syncAll("selftest")) {
      synced = true
      break
    }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  if (!synced) {
    console.error("[ducoro-bridge] another host is syncing; selftest not run")
    process.exit(1)
  }
  console.log("[ducoro-bridge] selftest done")
  process.exit(0)
}
