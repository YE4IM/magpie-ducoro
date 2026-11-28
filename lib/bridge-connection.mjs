import { resolveCapabilityMappings } from "./model-capabilities.mjs"
import { sha256 } from "./resource-plan.mjs"
import { isPlainObject, trimmedString as str } from "./utils.mjs"

const sameSet = (a, b) => {
  const norm = (x) => (Array.isArray(x) ? [...x].map(String).sort() : [])
  return JSON.stringify(norm(a)) === JSON.stringify(norm(b))
}

const sameObj = (a, b) => {
  const norm = (x) => {
    if (!isPlainObject(x)) return ""
    return Object.keys(x)
      .sort()
      .map((k) => `${k}=${x[k]}`)
      .join("|")
  }
  return norm(a) === norm(b)
}

const matchesWant = (saved, want) =>
  Boolean(saved) &&
  str(saved.baseUrl) === want.baseUrl &&
  str(saved.defaultModel) === want.model &&
  sameSet(saved.models, want.models) &&
  sameObj(saved.modelCapabilityRefs, want.refs)

export function createConnectionSync({
  opts,
  dryRun,
  paths,
  run,
  getState,
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
  setCapabilitiesForRound,
}) {
  const connectionSlug = String(opts.connectionSlug)

  const refsFor = async (ids, existing, descriptors) => {
    const [cat, providers, pluginProviders] = await Promise.all([
      ids.length ? capabilityCatalog.load() : null,
      readJsonDetailed(paths.providers),
      readJsonDetailed(paths.pluginProviders),
    ])
    for (const result of [providers, pluginProviders]) {
      if (!result.ok && !result.missing) requestRetry("model-metadata")
    }
    return resolveCapabilityMappings({
      ids,
      catalog: cat,
      existing,
      exported: descriptors,
      providers: providers.ok ? providers.value : null,
      pluginProviders: pluginProviders.ok ? pluginProviders.value : [],
      metadataUnavailable: [providers, pluginProviders].some(
        (result) => !result.ok && !result.missing,
      ),
      previous: getState().modelCapabilities?.slug === connectionSlug ? getState().modelCapabilities : null,
      overrides: opts.modelCapabilityRefs,
      officialProviders: opts.officialProviders,
    })
  }

  const reportCapabilities = (plan, applied) => {
    setCapabilitiesForRound({
      applied,
      entries: plan.entries,
      updatedAt: new Date().toISOString(),
      roundId: diagnostics.token(),
    })
    for (const entry of plan.entries) {
      if (entry.status !== "matched" || entry.warnings.length) {
        warnOnce(
          `capability:${JSON.stringify(entry)}`,
          `model ${entry.id}: ${entry.status}; ` +
            `${entry.reference ? `reference ${entry.reference} (${entry.source})` : "no automatic reference; set modelCapabilityRefs if needed"}` +
            (entry.warnings.length ? `; ${entry.warnings.join(", ")}` : "") +
            "; details: open Ducoro sync diagnostics",
        )
      }
    }
  }

  const stageCapabilities = async (plan) => {
    if (!dryRun) {
      const state = getState()
      state.modelCapabilities = {
        ...(state.modelCapabilities?.slug === connectionSlug ? state.modelCapabilities : {}),
        slug: connectionSlug,
        pending: { refs: plan.refs, provenance: plan.provenance },
      }
      await saveState([["modelCapabilities"]])
    }
    reportCapabilities(plan, false)
  }

  const commitCapabilities = async (plan) => {
    const next = { slug: connectionSlug, ...plan.provenance }
    const state = getState()
    if (!dryRun && JSON.stringify(state.modelCapabilities) !== JSON.stringify(next)) {
      state.modelCapabilities = next
      await saveState([["modelCapabilities"]])
    }
    reportCapabilities(plan, true)
  }

  const getConnection = async (slug) => {
    const r = await run(["connections", "get", slug], { timeoutMs: 30_000 })
    if (r.ok) {
      // Parse failures also have json: null; only the explicit JSON literal means absent.
      if (r.json === null && r.stdout.trim() === "null") return null
      const connection = r.json?.connection ?? r.json
      if (dryRun || isPlainObject(connection)) return connection
      throw new Error("connections get returned an unknown response")
    }
    if (isNotFound(r)) return null
    throw new Error(`connections get ${slug} failed: ${errMsg(r)}`)
  }

  const connectionArgs = (want, { creating = false } = {}) => {
    const a = []
    if (want.model) a.push("--model", want.model)
    if (want.models.length) a.push("--models", want.models.join(","))
    const refs = Object.entries(want.refs)
    // Creation rejects empty refs; updates require an empty value to clear old refs.
    if (refs.length || !creating) {
      a.push("--capability-refs", refs.map(([k, v]) => `${k}=${v}`).join(","))
    }
    return a
  }

  const writeConnection = async (mode, slug, want, key) => {
    const creating = mode === "create"
    const args = creating
      ? ["connections", "add-apikey", "custom-openai-compat", "--slug", slug]
      : ["connections", "update-apikey", slug]
    const r = await run(
      [
        ...args,
        "--name", want.name,
        "--base-url", want.baseUrl,
        ...connectionArgs(want, { creating }),
        "--stdin",
      ],
      { stdin: key },
    )
    const action = creating ? "creating" : "updating"
    const done = creating ? "created" : "updated"
    if (!r.ok) {
      log(`${action} connection ${slug} failed (kept for retry): ${errMsg(r)}`)
      requestRetry("gateway-sync")
      return false
    }
    log(`connection ${slug} ${done} -> ${want.baseUrl}${want.model ? ` (model ${want.model})` : ""}`)
    return true
  }

  const commitAndSync = async (saved, want, capabilityPlan, failureMessage) => {
    if (!matchesWant(saved, want)) throw new Error(failureMessage)
    await commitCapabilities(capabilityPlan)
    await modelSync.sync({ ...saved, slug: connectionSlug })
    return true
  }

  const syncConnection = async ({ gwV1, key, model, models, descriptors }) => {
    if (model && models.length && !models.includes(model)) {
      log("selected model is absent from Magpie's export; keeping the connection and Bots for retry")
      requestRetry("gateway-model-catalog")
      return
    }
    const cur = await getConnection(connectionSlug)
    const capabilityPlan = await refsFor(models, cur?.modelCapabilityRefs, descriptors)
    const want = {
      name: String(opts.connectionName),
      baseUrl: gwV1,
      model,
      models,
      refs: capabilityPlan.refs,
    }
    const keyHash = sha256(key)
    const state = getState()

    if (!cur) {
      await stageCapabilities(capabilityPlan)
      if (await writeConnection("create", connectionSlug, want, key)) {
        state.connection = { slug: connectionSlug, keyHash, baseUrl: want.baseUrl, model: want.model }
        await saveState([["connection"]])
        if (dryRun) return
        const saved = await getConnection(connectionSlug)
        return commitAndSync(
          saved,
          want,
          capabilityPlan,
          "created connection readback differs; Bot sync deferred",
        )
      }
      return
    }

    if (!state.connection || state.connection.slug !== connectionSlug) {
      // A profile with this slug exists but this plugin did not create it.
      // Adopt it only when it already points at this gateway; never touch a
      // stranger's route.
      if (str(cur.baseUrl) === want.baseUrl) {
        log(`adopting existing connection ${connectionSlug}`)
        state.connection = {
          slug: connectionSlug,
          keyHash: null,
          baseUrl: want.baseUrl,
          model: str(cur.defaultModel),
        }
      } else {
        warnOnce(
          `conn:${connectionSlug}`,
          `connection "${connectionSlug}" exists and was not created by this plugin; ` +
            `pick another connectionSlug option to let the bridge create its own`,
        )
        return
      }
    }

    await modelSync.prepare(connectionSlug, model, str(cur.defaultModel))
    const changed =
      state.connection.keyHash !== keyHash ||
      str(cur.baseUrl) !== want.baseUrl ||
      str(cur.defaultModel) !== want.model ||
      !sameSet(cur.models, want.models) ||
      !sameObj(cur.modelCapabilityRefs, want.refs)
    if (changed) await stageCapabilities(capabilityPlan)
    if (changed && !(await writeConnection("update", connectionSlug, want, key))) return
    if (changed) {
      state.connection = { slug: connectionSlug, keyHash, baseUrl: want.baseUrl, model: want.model }
      await saveState([["connection"]])
    }
    // Reconcile even when the route is unchanged: this also repairs stale Bot
    // IDs left by 0.3.0 or retries a Bot update after a connection write succeeded.
    const saved = changed ? await getConnection(connectionSlug) : cur
    return commitAndSync(
      saved,
      want,
      capabilityPlan,
      "saved connection readback differs; Bot sync deferred",
    )
  }

  const removeConnection = async () => {
    const state = getState()
    const slug = state.connection?.slug
    if (!slug) return
    const r = await run(["connections", "rm", slug], { timeoutMs: 30_000 })
    if (r.ok || isNotFound(r)) {
      log(`connection ${slug} removed`)
      state.connection = null
      await saveState([["connection"]])
    } else {
      log(`removing connection ${slug} failed: ${errMsg(r)}`)
      requestRetry("gateway-sync")
    }
  }

  return { syncConnection, removeConnection }
}
